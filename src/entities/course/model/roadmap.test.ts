import { describe, it, expect } from 'vitest';
import { allLessons } from './curriculum';
import { roadmap, stageStatus } from './roadmap';

describe('дорожная карта', () => {
  it('каждый урок курса стоит ровно в одной ступени и в порядке учебного плана', () => {
    const inRoadmap = roadmap.flatMap((s) => s.lessons);
    expect(inRoadmap).toEqual(allLessons.map((l) => l.id));
  });

  it('id ступеней уникальны, у каждой есть зачем, навыки и контрольная точка', () => {
    expect(new Set(roadmap.map((s) => s.id)).size).toBe(roadmap.length);
    for (const s of roadmap) {
      expect(s.why.length, s.id).toBeGreaterThan(40);
      expect(s.skills.length, s.id).toBeGreaterThan(1);
      expect(s.checkpoint.length, s.id).toBeGreaterThan(30);
    }
  });

  it('ссылки на Доку — пути вида js/… или tools/…, без повторов внутри ступени', () => {
    for (const s of roadmap) {
      const paths = s.reading.map((r) => r.path);
      expect(new Set(paths).size, s.id).toBe(paths.length);
      for (const p of paths) expect(p, s.id).toMatch(/^(js|tools)\/[a-z0-9-]+$/);
    }
  });

  it('у каждой ступени есть уроки или материалы для чтения', () => {
    for (const s of roadmap) expect(s.lessons.length + s.reading.length + s.tasks.length, s.id).toBeGreaterThan(0);
  });
});

describe('stageStatus', () => {
  const stage = roadmap.find((s) => s.lessons.length > 0 && s.reading.length > 0)!;

  it('ничего не сделано → todo, частично → progress, всё → done', () => {
    expect(stageStatus(stage, [], []).state).toBe('todo');
    expect(stageStatus(stage, [stage.lessons[0]], []).state).toBe('progress');
    expect(stageStatus(stage, stage.lessons, stage.reading.map((r) => r.path))).toEqual({
      state: 'done',
      done: stage.lessons.length + stage.reading.length,
      total: stage.lessons.length + stage.reading.length,
    });
  });
});
