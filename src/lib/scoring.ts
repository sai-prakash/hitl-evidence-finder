/** Cosine requires matching dimensions; zero vectors have no similarity. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error('Embedding dimensions differ');
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! ** 2;
    nb += b[i]! ** 2;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Existing fusion heuristic; this weight is not a calibrated confidence. */
export function fusionScore(text: number, image: number): number {
  return Math.max(text, image * 0.95);
}

export function meetsThreshold(score: number, threshold: number): boolean {
  return Number.isFinite(score) && Number.isFinite(threshold) && score >= threshold;
}

export function rankPages(query: ArrayLike<number>, pages: readonly { id: string; text: number[]; image: number[] }[], fusion = true) {
  return pages.map((p) => {
    const textScore = cosineSimilarity(query, p.text);
    const imageScore = cosineSimilarity(query, p.image);
    return { id: p.id, textScore, imageScore, score: fusion ? fusionScore(textScore, imageScore) : textScore };
  }).sort((a, b) => b.score - a.score);
}
