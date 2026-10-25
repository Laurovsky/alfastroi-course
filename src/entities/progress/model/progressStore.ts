import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { safeStorage } from '@/shared/lib/storage';

interface ProgressState {
  completedLessons: string[];
  passedExercises: string[];
  /** id квиза → индекс выбранного ответа. */
  quizAnswers: Record<string, number>;
  /** id упражнения → черновик кода ученика. */
  drafts: Record<string, string>;
  completeLesson: (id: string) => void;
  uncompleteLesson: (id: string) => void;
  markExercisePassed: (id: string) => void;
  answerQuiz: (id: string, option: number) => void;
  saveDraft: (id: string, code: string) => void;
  reset: () => void;
}

const initial = { completedLessons: [], passedExercises: [], quizAnswers: {}, drafts: {} };

const addUnique = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);

/**
 * Прогресс ученика. Живёт только в браузере (localStorage через safeStorage),
 * сервера у курса нет. Тот же паттерн Zustand, что и в сторах Альфастрой.
 */
export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      ...initial,
      completeLesson: (id) => set((s) => ({ completedLessons: addUnique(s.completedLessons, id) })),
      uncompleteLesson: (id) => set((s) => ({ completedLessons: s.completedLessons.filter((x) => x !== id) })),
      markExercisePassed: (id) => set((s) => ({ passedExercises: addUnique(s.passedExercises, id) })),
      answerQuiz: (id, option) => set((s) => ({ quizAnswers: { ...s.quizAnswers, [id]: option } })),
      saveDraft: (id, code) => set((s) => ({ drafts: { ...s.drafts, [id]: code } })),
      reset: () => set(initial),
    }),
    { name: 'alfastroi-course-progress', version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);
