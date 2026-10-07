import {
  cosineSimilarity,
  embedImageUrl,
  embedText,
  hasVision,
} from './embedder';
import {
  EVIDENCE_PAGES,
  claimQueryText,
  pageDocumentText,
  type EvidencePage,
} from './samples';

export type IndexedPage = EvidencePage & {
  textEmbedding: Float32Array;
  imageEmbedding: Float32Array | null;
};

export type EvidenceHit = EvidencePage & {
  score: number;
  match: 'text' | 'image' | 'both';
};

let index: IndexedPage[] | null = null;
let buildPromise: Promise<IndexedPage[]> | null = null;

export function getIndex(): IndexedPage[] | null {
  return index;
}

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(() => resolve(), { timeout: 48 });
      void id;
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export async function buildIndex(
  onItem?: (done: number, total: number, label: string) => void,
): Promise<IndexedPage[]> {
  if (index) return index;
  if (buildPromise) return buildPromise;

  buildPromise = (async () => {
    const out: IndexedPage[] = [];
    const total = EVIDENCE_PAGES.length;
    const errors: string[] = [];
    const vision = hasVision();

    for (let i = 0; i < EVIDENCE_PAGES.length; i++) {
      const page = EVIDENCE_PAGES[i]!;
      onItem?.(i, total, page.title);
      await yieldToMain();

      try {
        const textEmbedding = await embedText(pageDocumentText(page));
        let imageEmbedding: Float32Array | null = null;
        if (vision) {
          await yieldToMain();
          try {
            imageEmbedding = await embedImageUrl(page.src);
          } catch (err) {
            console.warn(`[index] image embed failed for ${page.id}`, err);
          }
        }
        out.push({ ...page, textEmbedding, imageEmbedding });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[index] failed on ${page.id}:`, err);
        errors.push(`${page.title}: ${msg}`);
      }
    }

    onItem?.(total, total, 'done');

    if (out.length === 0) {
      buildPromise = null;
      throw new Error(
        errors[0]
          ? `Indexing failed — ${errors[0]}`
          : 'Indexing failed — no pages could be embedded',
      );
    }

    if (errors.length > 0) {
      console.warn(
        `[index] ${errors.length}/${total} pages failed; continuing with ${out.length}`,
        errors,
      );
    }

    index = out;
    return out;
  })();

  try {
    return await buildPromise;
  } catch (err) {
    buildPromise = null;
    throw err;
  }
}

/** Rank evidence pages for an AI claim (shared embedding space). */
export async function findEvidenceForClaim(
  claim: string,
  topK = 3,
): Promise<EvidenceHit[]> {
  const embedding = await embedText(claimQueryText(claim.trim()));
  if (!index) return [];

  return index
    .map((item) => {
      const textScore = cosineSimilarity(embedding, item.textEmbedding);
      const imageScore = item.imageEmbedding
        ? cosineSimilarity(embedding, item.imageEmbedding)
        : -Infinity;
      const useImage = imageScore > textScore;
      const score = useImage ? Math.max(textScore, imageScore * 0.95) : textScore;
      const match: EvidenceHit['match'] =
        item.imageEmbedding && useImage
          ? textScore >= imageScore * 0.98
            ? 'both'
            : 'image'
          : 'text';
      return { ...item, score, match };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ textEmbedding: _t, imageEmbedding: _i, ...rest }) => rest);
}
