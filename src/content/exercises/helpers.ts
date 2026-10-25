/** Достаёт значение из кода ученика с нужным типом (для тестов упражнений). */
export function get<T>(api: Record<string, unknown>, name: string): T {
  return api[name] as T;
}

/** Вызывает функцию ученика по имени. */
export function call(api: Record<string, unknown>, name: string, ...args: unknown[]): unknown {
  return get<(...a: unknown[]) => unknown>(api, name)(...args);
}

/** Создаёт экземпляр класса ученика по имени. */
export function construct(api: Record<string, unknown>, name: string, ...args: unknown[]): unknown {
  const Cls = get<new (...a: unknown[]) => unknown>(api, name);
  return new Cls(...args);
}
