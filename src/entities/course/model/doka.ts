import { dokaArticles, type DokaArticle } from '@/content/doka/articles';

/** Метаданные статьи Доки по пути (`tools/tdd`); undefined — статьи нет в реестре. */
export function getDokaArticle(path: string): DokaArticle | undefined {
  return dokaArticles[path];
}
