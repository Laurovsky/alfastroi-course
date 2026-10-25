/**
 * withTimeout — race промиса с таймером.
 *
 * Используется для обёртки сетевых вызовов в Supabase (auth + REST), чтобы
 * избежать многосекундных зависаний на stale TCP-сокетах undici или временной
 * деградации Supabase. Симметрично клиентскому `withTimeout` в `/client/src/lib/api.ts`.
 *
 * При срабатывании таймаута бросает TimeoutError с указанием label, чтобы
 * в логах было видно какой именно вызов завис.
 */

export class TimeoutError extends Error {
  constructor(public readonly label: string, public readonly ms: number) {
    super(`${label} timeout after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TimeoutError(label, ms)), ms),
    ),
  ])
}
