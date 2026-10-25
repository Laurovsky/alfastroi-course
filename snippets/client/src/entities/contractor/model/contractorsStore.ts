import { create } from 'zustand';
import { apiFetch } from '@/shared/api/api';
import { translateError } from '@/shared/lib/error-messages';

export interface ContractorUsage {
  rate_sets: number;
  work: number;
}

export interface Contractor {
  id: string;
  name: string;
  type: 'ip' | 'ooo';
  inn: string | null;
  okpo: string | null;
  ogrn: string | null;
  address: string | null;
  registered_at: string | null;
  markup_coefficient: number | null;
  director_name: string | null;
  director_position: string | null;
  tax_system: string | null;
  vat_rate: number | null;
  /** Контакты (вкладка «Контакты» карточки). */
  contact_person: string | null;
  contact_position: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  comment: string | null;
  /** Папка справочника; null — «Без папки». */
  folder_id: string | null;
  created_at: string;
  usage?: ContractorUsage;
}

export interface ContractorRateSet {
  id: string;
  name: string;
  package_id: string;
  package_name: string | null;
  system_code: string | null;
  system_codes: string[] | null;
  valid_from: string;
  rates_count: number;
}

export interface UpsertContractorInput {
  name: string;
  type: 'ip' | 'ooo';
  inn?: string | null;
  okpo?: string | null;
  ogrn?: string | null;
  address?: string | null;
  registered_at?: string | null;
  markup_coefficient?: number | null;
  director_name?: string | null;
  director_position?: string | null;
  tax_system?: string | null;
  vat_rate?: number | null;
  contact_person?: string | null;
  contact_position?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  comment?: string | null;
  folder_id?: string | null;
}

export interface CloneRateSetForContractorInput {
  contractor_id: string;
  source_rate_set_id: string;
}

interface ContractorsState {
  contractors: Contractor[];
  rateSetsByContractor: Record<string, ContractorRateSet[]>;
  loading: boolean;
  error: string | null;

  fetchContractors: () => Promise<void>;
  fetchContractorRateSets: (contractorId: string) => Promise<void>;
  createContractor: (input: UpsertContractorInput) => Promise<Contractor | null>;
  cloneRateSetForContractor: (input: CloneRateSetForContractorInput) => Promise<boolean>;
  updateContractor: (id: string, input: UpsertContractorInput) => Promise<Contractor | null>;
  deleteContractor: (id: string) => Promise<boolean>;
  unlinkRateSet: (contractorId: string, rateSetId: string) => Promise<boolean>;
}

/** Single contractor/list/rate-set cache owner for this browser session.
 * Writes preserve their row/null or boolean contracts. Reads absorb errors; clone/unlink
 * await those reads, while failed delete starts a background list refresh. No scope reset.
 */
export const useContractorsStore = create<ContractorsState>((set, get) => ({
  contractors: [],
  rateSetsByContractor: {},
  loading: false,
  error: null,

  fetchContractors: async () => {
    set({ loading: true });
    try {
      const data = await apiFetch<Contractor[]>('/api/contractors');
      set({ contractors: data, error: null });
    } catch (e) {
      const msg = translateError(e);
      set({ error: `Не удалось загрузить подрядчиков: ${msg}` });
    } finally {
      set({ loading: false });
    }
  },

  fetchContractorRateSets: async (contractorId: string) => {
    try {
      const data = await apiFetch<ContractorRateSet[]>(
        `/api/contractors/${encodeURIComponent(contractorId)}/rate-sets`
      );
      set((s) => ({
        rateSetsByContractor: { ...s.rateSetsByContractor, [contractorId]: data },
        error: null
      }));
    } catch (e) {
      const msg = translateError(e);
      set({ error: `Не удалось загрузить расценки подрядчика: ${msg}` });
    }
  },

  cloneRateSetForContractor: async (input) => {
    try {
      await apiFetch(
        `/api/contractors/${encodeURIComponent(input.contractor_id)}/rate-sets/clone`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': crypto.randomUUID() },
          body: JSON.stringify({ source_rate_set_id: input.source_rate_set_id })
        }
      );
      await get().fetchContractorRateSets(input.contractor_id);
      set({ error: null });
      return true;
    } catch (e) {
      const msg = translateError(e);
      set({ error: `Не удалось привязать набор расценок: ${msg}` });
      return false;
    }
  },

  createContractor: async (input) => {
    try {
      const created = await apiFetch<Contractor>('/api/contractors', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(input)
      });
      // Оптимистичное обновление списка
      set((s) => ({
        contractors: [...s.contractors, created].sort((a, b) => {
          if (a.type !== b.type) return a.type.localeCompare(b.type);
          return a.name.localeCompare(b.name);
        }),
        error: null
      }));
      return created;
    } catch (e) {
      const msg = translateError(e);
      set({ error: `Не удалось создать подрядчика: ${msg}` });
      return null;
    }
  },

  updateContractor: async (id, input) => {
    try {
      const updated = await apiFetch<Contractor>(`/api/contractors/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(input)
      });
      set((s) => ({
        contractors: s.contractors.map((c) => (c.id === id ? updated : c)),
        error: null
      }));
      return updated;
    } catch (e) {
      const msg = translateError(e);
      set({ error: `Не удалось сохранить подрядчика: ${msg}` });
      return null;
    }
  },

  deleteContractor: async (id) => {
    try {
      await apiFetch(`/api/contractors/${encodeURIComponent(id)}`, { method: 'DELETE' });
      set((s) => ({
        contractors: s.contractors.filter((c) => c.id !== id),
        error: null
      }));
      return true;
    } catch (e) {
      const msg = translateError(e);
      set({ error: `Не удалось удалить подрядчика: ${msg}` });
      // Refresh для актуального состояния
      void get().fetchContractors();
      return false;
    }
  },

  unlinkRateSet: async (contractorId, rateSetId) => {
    try {
      await apiFetch(
        `/api/contractors/${encodeURIComponent(contractorId)}/rate-sets/${encodeURIComponent(rateSetId)}/unlink`,
        { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } }
      );
      // Обновляем и список наборов подрядчика, и список подрядчиков (usage изменился)
      await get().fetchContractorRateSets(contractorId);
      await get().fetchContractors();
      set({ error: null });
      return true;
    } catch (e) {
      const msg = translateError(e);
      set({ error: `Не удалось отвязать набор: ${msg}` });
      return false;
    }
  }
}));
