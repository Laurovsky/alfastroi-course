import type { Exercise } from '@/entities/exercise/model/types';
import { buildTree, compareCodes, deriveRowType, formatDisplayName, isValidPeriod } from './fundamentals';
import { matchMultiset, numericExpression } from './testing';
import { idempotencyStore, requireRole, withTimeout } from './backend';
import {
  analysisActions,
  checkImport,
  conditionalUpdate,
  findCommonPrefix,
  rpcErrorMapping,
  stableSelector,
} from './architecture';

/** Все упражнения курса. id используется в MDX: <Exercise id="..." />. */
export const exercises: Exercise[] = [
  formatDisplayName,
  compareCodes,
  buildTree,
  deriveRowType,
  isValidPeriod,
  numericExpression,
  matchMultiset,
  requireRole,
  idempotencyStore,
  withTimeout,
  conditionalUpdate,
  rpcErrorMapping,
  findCommonPrefix,
  analysisActions,
  stableSelector,
  checkImport,
];
