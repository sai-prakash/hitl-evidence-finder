import type { Claim } from './samples';

/** The reviewer's call on one claim + page. The model never makes this call. */
export type Relation = 'supports' | 'contradicts' | 'not-enough-info';

export const RELATION_LABEL: Record<Relation, string> = {
  supports: 'Supports',
  contradicts: 'Contradicts',
  'not-enough-info': 'Not enough info',
};

export const RELATIONS = Object.keys(RELATION_LABEL) as Relation[];

/**
 * Answer key for an example claim, derived from the tone the demo author wrote
 * with each claim. The expected page supports a "supported" claim and
 * contradicts a "misleading" one; the other pages cover unrelated topics.
 * Null when there is no key (e.g. a "contested" claim's expected page).
 */
export function expectedRelation(claim: Pick<Claim, 'tone' | 'expectedPageId'>, pageId: string): Relation | null {
  if (!claim.expectedPageId) return null;
  if (pageId !== claim.expectedPageId) return 'not-enough-info';
  if (claim.tone === 'supported') return 'supports';
  if (claim.tone === 'misleading') return 'contradicts';
  return null;
}
