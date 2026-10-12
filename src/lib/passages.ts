import { cosineSimilarity } from './scoring.ts';

/** Preserve punctuation and excerpt order, splitting only at sentence boundaries. */
export function splitSentences(excerpt: string): string[] {
  return excerpt.trim().split(/(?<=[.!?])\s+/u).map((s) => s.trim()).filter(Boolean);
}

/** Null means no sentence embeddings are available (older precomputed artifacts). */
export function bestSentenceIndex(query: ArrayLike<number>, sentences: readonly ArrayLike<number>[]): number | null {
  let best: number | null = null;
  let score = -Infinity;
  sentences.forEach((sentence, index) => {
    const next = cosineSimilarity(query, sentence);
    if (next > score) { best = index; score = next; }
  });
  return best;
}
