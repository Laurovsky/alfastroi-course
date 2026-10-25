import type { NextFunction, Request, Response } from 'express'
import { supabase } from '@/db/supabase'
import { hashRequestIdentity } from '@/middleware/requestIdentity'

const KEY_REGEX = /^[A-Za-z0-9_-]{8,128}$/
const NORMAL_RETENTION_SECONDS = 24 * 60 * 60
const ERROR_RETENTION_SECONDS = 5 * 60

type Reservation = {
  state: 'reserved' | 'completed' | 'in_progress' | 'endpoint_mismatch' | 'body_mismatch'
  response_status: number | null
  response_body: unknown
}

function apiError(res: Response, req: Request, status: number, code: string, error: string): void {
  res.status(status).json({ code, error, requestId: req.requestId })
}

function requestFiles(req: Request): Express.Multer.File[] {
  if (req.file) return [req.file]
  if (Array.isArray(req.files)) return req.files
  if (req.files) return Object.values(req.files).flat()
  return []
}

async function reserve(input: {
  key: string
  userId: string
  endpoint: string
  requestHash: string
}): Promise<Reservation> {
  const { data, error } = await supabase.rpc('reserve_idempotency_key', {
    p_key: input.key,
    p_user_id: input.userId,
    p_endpoint: input.endpoint,
    p_request_hash: input.requestHash,
  })
  if (error || !data?.[0]) throw new Error(error?.message ?? 'empty idempotency reservation')
  return data[0] as Reservation
}

async function complete(
  key: string,
  userId: string,
  status: number,
  body: unknown,
): Promise<void> {
  const { error } = await supabase.rpc('complete_idempotency_key', {
    p_key: key,
    p_user_id: userId,
    p_response_status: status,
    p_response_body: body,
    p_retention_seconds: status >= 500 ? ERROR_RETENTION_SECONDS : NORMAL_RETENTION_SECONDS,
  })
  if (error) throw new Error(error.message)
}

export function requireIdempotency(endpoint: string) {
  return async function idempotencyMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const rawKey = req.header('Idempotency-Key')
    const userId = req.user?.id
    if (!rawKey) {
      apiError(res, req, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Для этого запроса требуется Idempotency-Key')
      return
    }
    if (!userId) {
      apiError(res, req, 401, 'IDEMPOTENCY_AUTH_REQUIRED', 'Требуется авторизация для Idempotency-Key')
      return
    }
    if (!KEY_REGEX.test(rawKey)) {
      apiError(res, req, 400, 'IDEMPOTENCY_KEY_INVALID', 'Idempotency-Key должен быть 8-128 символов [A-Za-z0-9_-]')
      return
    }

    let reservation: Reservation
    try {
      reservation = await reserve({
        key: rawKey,
        userId,
        endpoint,
        requestHash: hashRequestIdentity({
          params: req.params,
          body: req.body,
          files: requestFiles(req),
        }),
      })
    } catch (err) {
      console.error('[idempotency] reserve error:', { requestId: req.requestId, key: rawKey, err })
      apiError(res, req, 503, 'IDEMPOTENCY_UNAVAILABLE', 'Сервис идемпотентности недоступен, повторите запрос')
      return
    }

    if (reservation.state === 'completed') {
      res.status(reservation.response_status ?? 200).json(reservation.response_body)
      return
    }
    if (reservation.state === 'in_progress') {
      apiError(res, req, 409, 'IDEMPOTENCY_IN_PROGRESS', 'Запрос с этим Idempotency-Key ещё выполняется')
      return
    }
    if (reservation.state === 'endpoint_mismatch' || reservation.state === 'body_mismatch') {
      apiError(
        res,
        req,
        422,
        reservation.state === 'endpoint_mismatch'
          ? 'IDEMPOTENCY_ENDPOINT_MISMATCH'
          : 'IDEMPOTENCY_BODY_MISMATCH',
        reservation.state === 'endpoint_mismatch'
          ? 'Idempotency-Key уже использован для другого endpoint'
          : 'Idempotency-Key уже использован с другими параметрами запроса',
      )
      return
    }

    const originalJson = res.json.bind(res)
    const originalSend = res.send.bind(res)
    const originalEnd = res.end.bind(res)
    let finalized = false

    const finalize = (body: unknown, deliver: () => void): Response => {
      if (finalized) {
        deliver()
        return res
      }
      finalized = true
      const status = res.statusCode
      void complete(rawKey, userId, status, body)
        .then(deliver)
        .catch((err) => {
          console.error('[idempotency] finalize error:', { requestId: req.requestId, key: rawKey, err })
          res.status(503)
          originalJson({
            code: 'IDEMPOTENCY_UNAVAILABLE',
            error: 'Сервис идемпотентности недоступен, повторите запрос',
            requestId: req.requestId,
          })
        })
      return res
    }

    // Intercept after JSON response adapters and Express serialization, while
    // still completing the reservation before delivering any bytes.
    res.send = ((body: unknown) => {
      if (body !== null && typeof body === 'object' && !Buffer.isBuffer(body)) {
        return originalSend(body) // Express sends objects through res.json first.
      }
      let responseBody = body
      if (typeof body === 'string' && String(res.getHeader('Content-Type') ?? '').includes('application/json')) {
        try { responseBody = JSON.parse(body) } catch { /* Retain non-JSON responses verbatim. */ }
      }
      return finalize(responseBody, () => { originalSend(body) })
    }) as Response['send']
    res.end = ((...args: Parameters<Response['end']>) =>
      finalize(null, () => { originalEnd(...args) })) as Response['end']

    next()
  }
}
