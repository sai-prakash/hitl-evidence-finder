import { EVIDENCE_PAGES, type EvidencePage } from './samples';

export type EvidenceHit = { page: EvidencePage; score: number };
export const byId = new Map(EVIDENCE_PAGES.map((p) => [p.id, p]));
export const pageById = (id: string) => byId.get(id)!;
