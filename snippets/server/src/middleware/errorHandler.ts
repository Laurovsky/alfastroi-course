import type { ErrorRequestHandler, Response } from 'express'
import { ConflictError, ForbiddenError } from '@/lib/versionCheck'
import { BadRequestError, NotFoundError } from '@/lib/httpErrors'
import { captureRequestError } from '@/lib/sentry'

export type ApiErrorBody = {
  code: string
  error: string
  requestId: string
}

function sendError(
  res: Response,
  requestId: string,
  status: number,
  code: string,
  error: string,
): void {
  res.status(status).json({ code, error, requestId } satisfies ApiErrorBody)
}

/**
 * Централизованный error handler. Регистрируется ПОСЛЕДНИМ в Express-пайплайне.
 * - ForbiddenError (роль/RLS) → 403
 * - ConflictError (optimistic locking / wrong status) → 409
 * - body-parser PayloadTooLarge (тело > лимита) → 413 (русификация — на клиенте, translateError)
 * - всё остальное → 500 + message, лог в journal и событие в Sentry (если задан DSN)
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof BadRequestError) {
    sendError(res, req.requestId, 400, 'BAD_REQUEST', err.message)
    return
  }
  if (err instanceof NotFoundError) {
    sendError(res, req.requestId, 404, 'NOT_FOUND', err.message)
    return
  }
  if (err instanceof ForbiddenError) {
    sendError(res, req.requestId, 403, 'FORBIDDEN', err.message)
    return
  }
  if (err instanceof ConflictError) {
    sendError(res, req.requestId, 409, 'CONFLICT', err.message)
    return
  }
  // body-parser помечает превышение лимита тела type='entity.too.large'.
  if ((err as { type?: string })?.type === 'entity.too.large') {
    sendError(
      res,
      req.requestId,
      413,
      'PAYLOAD_TOO_LARGE',
      'Размер запроса превышает допустимый лимит',
    )
    return
  }
  console.error('[errorHandler]', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    err,
  })
  captureRequestError(err, req)
  sendError(res, req.requestId, 500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера')
}
