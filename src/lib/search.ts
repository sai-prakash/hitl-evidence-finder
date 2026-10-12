import { rankPages } from './scoring';
import { bestSentenceIndex } from './passages';
import { embedText } from './embedder';
import { claimQueryText } from './samples';
import { byId, type EvidenceHit } from './pages';
export { loadEmbedder } from './embedder';


type Entry = { id: string; text: number[]; image: number[]; sentences?: number[][] };
let pages: Entry[] | null = null;

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
  return rankPages(v, pages).map((hit) => ({
    page: byId.get(hit.id)!,
    score: hit.score,
    bestSentenceIndex: bestSentenceIndex(v, pages!.find((p) => p.id === hit.id)!.sentences ?? []),
  }));
}
