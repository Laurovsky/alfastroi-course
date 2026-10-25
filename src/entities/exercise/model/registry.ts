import { exercises } from '@/content/exercises';
import type { Exercise } from './types';

const byId = new Map(exercises.map((e) => [e.id, e]));

export function getExercise(id: string): Exercise | undefined {
  return byId.get(id);
}

export function listExercises(): Exercise[] {
  return exercises;
}
