import type { Response } from 'express'
import type { ZodError, ZodSchema } from 'zod'

/**
 * Парсит вход через zod-схему. Возвращает данные на успехе,
 * пишет 400 в response и null на ошибке.
 *
 * Использование в route:
 *   const parsed = parseOr400(schema, req.body, res)
 *   if (!parsed) return
 *   // ... используем parsed
 */
export function parseOr400<T>(schema: ZodSchema<T>, input: unknown, res: Response): T | null {
  const result = schema.safeParse(input)
  if (!result.success) {
    res.status(400).json({
      error: 'Невалидные параметры',
      details: formatZodError(result.error),
    })
    return null
  }
  return result.data
}

function formatZodError(err: ZodError): Record<string, string[]> {
  return err.flatten().fieldErrors as Record<string, string[]>
}
