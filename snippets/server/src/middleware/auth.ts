import { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { supabase } from '@/db/supabase'
import { withTimeout, TimeoutError } from '@/lib/withTimeout'

const AUTH_TIMEOUT_MS = 3000
const verifiedSubjectSchema = z.string().uuid()

/** Расширяем Express Request — добавляем поле user */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: 'engineer' | 'supervisor' | 'foreman' | 'sdo' | 'admin'
      }
    }
  }
}

/**
 * authMiddleware — проверяет JWT токен из заголовка Authorization.
 *
 * 1. Берёт токен из "Bearer <token>"
 * 2. Верифицирует JWT через getClaims → получает проверенный sub
 * 3. Достаёт роль из таблицы profiles
 * 4. Кладёт { id, role } в req.user
 * 5. Если что-то не так → 401
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Токен не предоставлен' })
    return
  }

  const token = header.slice(7) // убираем "Bearer "

  // При асимметричном ES256 getClaims проверяет JWT локально через кешированный
  // JWKS. Таймаут остаётся для первого получения ключа или cache miss.
  let userId: string
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getClaims(token),
      AUTH_TIMEOUT_MS,
      'auth.getClaims',
    )
    const subject = verifiedSubjectSchema.safeParse(data?.claims?.sub)
    if (error || !subject.success) {
      res.status(401).json({ error: 'Невалидный токен' })
      return
    }
    userId = subject.data
  } catch (e) {
    if (e instanceof TimeoutError) {
      console.error('[authMiddleware]', e.message)
      res.status(503).json({ error: 'Сервис аутентификации недоступен, повторите запрос' })
      return
    }
    throw e
  }

  // Достаём роль из profiles — тот же риск зависания на REST-сокете.
  let profile: { role: string } | null
  try {
    const { data } = await withTimeout(
      Promise.resolve(supabase.from('profiles').select('role').eq('id', userId).single()),
      AUTH_TIMEOUT_MS,
      'profiles.select',
    )
    profile = data
  } catch (e) {
    if (e instanceof TimeoutError) {
      console.error('[authMiddleware]', e.message)
      res.status(503).json({ error: 'Сервис аутентификации недоступен, повторите запрос' })
      return
    }
    throw e
  }

  if (!profile) {
    res.status(403).json({ error: 'Профиль не найден' })
    return
  }

  req.user = { id: userId, role: profile.role as 'engineer' | 'supervisor' | 'foreman' | 'sdo' | 'admin' }
  next()
}

/**
 * requireRole — фабрика middleware, проверяет что у пользователя нужная роль.
 * Использование: router.post('/analyses', requireRole('engineer'), handler)
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Недостаточно прав' })
      return
    }
    next()
  }
}
