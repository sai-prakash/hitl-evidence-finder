import { cosineSimilarity, embedText } from './embedder';
import { EVIDENCE_PAGES, claimQueryText, type EvidencePage } from './samples';

export type EvidenceHit = { page: EvidencePage; score: number };

type Entry = { id: string; text: number[]; image: number[] };
let pages: Entry[] | null = null;
const byId = new Map(EVIDENCE_PAGES.map((p) => [p.id, p]));
export const pageById = (id: string) => byId.get(id)!;

/** Page embeddings were computed at build time with the same model (scripts/precompute.mjs). */
export async function loadPages(): Promise<void> {
  if (pages) return;
  const res = await fetch('/library-embeddings.json');
  if (!res.ok) throw new Error('fetch pages failed');
  pages = (await res.json()).pages as Entry[];
}

export async function findEvidenceForClaim(claim: string): Promise<EvidenceHit[]> {
  const v = await embedText(claimQueryText(claim.trim()));
  if (!pages) return [];
  return pages
    .map((e) => ({
      page: byId.get(e.id)!,
      score: Math.max(cosineSimilarity(v, e.text), cosineSimilarity(v, e.image) * 0.95),
    }))
    .sort((a, b) => b.score - a.score);
}
