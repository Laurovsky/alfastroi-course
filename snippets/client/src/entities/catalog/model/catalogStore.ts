import { createLatestRead } from '@/shared/lib/latest-read';
import { createScopeReader } from '@/shared/lib/scope-reader';
import { create } from 'zustand';
import { apiFetch } from '@/shared/api/api';
import { translateError } from '@/shared/lib/error-messages';

interface WorkPackage {
  id: string;
  name: string;
  estimate_parser: 'pik_1c' | 'sminex';
}

import type { CatalogItem, TreeNode } from './types';
export type { CatalogItem, TreeNode } from './types';

interface CatalogState {
  packages: WorkPackage[];
  items: CatalogItem[];
  tree: TreeNode[];
  selectedPackageId: string | null;
  loadedPackageId: string | null;
  /** Пользователь/роль, которым принадлежит загруженный кеш каталога. */
  loadedScope: string | null;
  loading: boolean;
  /** Последняя ошибка загрузки (для отображения в UI). null = ОК */
  error: string | null;
  /** Загрузить список пакетов */
  /** Объединяет pending-чтения; после изменения справочника нужен force. */
  fetchPackages: (options?: { force?: boolean }) => Promise<void>;
  /**
   * Выбирает пакет и загружает каталог. Делит только pending GET своего scope;
   * последний вызов владеет данными/loading/error. После записи нужен force.
   * Ошибки остаются в error; завершение Promise не гарантирует владение выбором.
   */
  fetchCatalog: (packageId: string, options?: { force?: boolean }) => Promise<void>;
  /** Использует только свой подтверждённый кеш; иначе выбирает пакет через fetchCatalog. */
  ensureCatalog: (packageId: string) => Promise<void>;
  /**
   * Выбирает пакет без загрузки каталога (страницы, которым весь каталог нужен не сразу,
   * догружают его через ensureCatalog/fetchCatalog). Кеш другого пакета не считается загруженным
   * для нового выбора: проверки сверяют loadedPackageId.
   */
  selectPackage: (packageId: string) => void;
}

/**
 * Строит дерево из плоского списка по parent_id.
 * Дети сортируются по sort_order (шаг 10, см. миграцию 003).
 */
function buildTree(items: CatalogItem[]): TreeNode[] {
  const childrenMap = new Map<string | null, CatalogItem[]>();

  for (const item of items) {
    const key = item.parent_id;
    const bucket = childrenMap.get(key);
    if (bucket) bucket.push(item);
    else childrenMap.set(key, [item]);
  }

  for (const bucket of childrenMap.values()) {
    bucket.sort((a, b) => a.sort_order - b.sort_order);
  }

  function toNodes(parentId: string | null): TreeNode[] {
    const children = childrenMap.get(parentId) ?? [];
    return children.map((item) => ({
      ...item,
      children: toNodes(item.id)
    }));
  }

  return toNodes(null);
}

const actorReader = createScopeReader<{
  userId: string | undefined;
  role: string | null;
  hasUser: boolean;
}>({ userId: undefined, role: null, hasUser: false });
/** App owns the live actor provider. Presence is separate from ID to preserve
 * the existing role-ready finally retry. Binding performs no GET or cache clear;
 * detached consumers are unsupported and fall back to anonymous scope.
 */
export const bindCatalogActor = actorReader.bind;
const catalogReads = createLatestRead<CatalogItem[]>();

// Только pending-чтения; завершённые ответы не заменяют следующее обновление.
const packageReads = createLatestRead<WorkPackage[]>();
function referenceScope() {
  const { userId, role } = actorReader.getSnapshot();
  return JSON.stringify([userId ?? null, role]);
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  packages: [],
  items: [],
  tree: [],
  selectedPackageId: null,
  loadedPackageId: null,
  loadedScope: null,
  loading: false,
  error: null,

  fetchPackages: async (options) => {
    const scope = referenceScope();
    const read = packageReads.start(
      scope,
      () => apiFetch<WorkPackage[]>('/api/packages'),
      options?.force
    );
    const isCurrent = () => read.isCurrent() && referenceScope() === scope;

    try {
      const data = await read.promise;
      if (isCurrent()) set({ packages: data, error: null });
    } catch (e) {
      const message = translateError(e);
      if (isCurrent()) set({ error: `Не удалось загрузить пакеты: ${message}` });
    }
  },

  fetchCatalog: async (packageId, options) => {
    const scope = referenceScope();
    const read = catalogReads.start(
      JSON.stringify([scope, packageId]),
      () => apiFetch<CatalogItem[]>(`/api/catalog/${packageId}`),
      options?.force
    );
    const isCurrent = () => read.isCurrent() && referenceScope() === scope;
    const keepCache = get().loadedPackageId === packageId && get().loadedScope === scope;
    set({
      loading: true,
      selectedPackageId: packageId,
      error: null,
      ...(keepCache ? {} : { items: [], tree: [], loadedPackageId: null, loadedScope: null })
    });
    try {
      const data = await read.promise;
      if (isCurrent())
        set({
          items: data,
          tree: buildTree(data),
          loadedPackageId: packageId,
          loadedScope: scope,
          loading: false
        });
    } catch (e) {
      const message = translateError(e);
      if (isCurrent()) set({ loading: false, error: `Не удалось загрузить каталог: ${message}` });
    } finally {
      // Роль может загрузиться уже после первого GET. Если нового владельца ещё
      // нет, завершаем старый loading и перечитываем для готового auth scope.
      // При выходе только очищаем данные: анонимный запрос запускать нельзя.
      if (read.isCurrent() && referenceScope() !== scope) {
        set({
          items: [],
          tree: [],
          loadedPackageId: null,
          loadedScope: null,
          loading: false,
          error: null
        });
        const { hasUser, role } = actorReader.getSnapshot();
        if (hasUser && role) await get().fetchCatalog(packageId);
      }
    }
  },
  selectPackage: (packageId) => {
    if (get().selectedPackageId !== packageId) set({ selectedPackageId: packageId });
  },
  ensureCatalog: (packageId) => {
    const state = get();
    if (
      state.loadedPackageId === packageId &&
      state.selectedPackageId === packageId &&
      state.loadedScope === referenceScope() &&
      !state.loading &&
      !state.error
    )
      return Promise.resolve();
    return state.fetchCatalog(packageId);
  }
}));
