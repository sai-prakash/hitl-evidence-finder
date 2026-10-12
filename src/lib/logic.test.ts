import { describe, expect, it, vi, afterEach } from 'vitest';
import { cosineSimilarity, fusionScore, rankPages, meetsThreshold } from './scoring';
import { splitSentences, bestSentenceIndex } from './passages';
import { MAX_UPLOAD_BYTES, validateUpload, downscaledDimensions } from './image-limits';
import { saveAuditLog, clearAuditLog, appendAudit } from './audit';

afterEach(() => vi.unstubAllGlobals());
describe('retrieval logic', () => {
  it('handles parallel, orthogonal, opposite and zero vectors', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1], [-1])).toBe(-1);
    expect(cosineSimilarity([0], [1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
  it('ranks text and fusion independently', () => {
    const pages = [{ id: 'text', text: [1, 1], image: [0, 1] }, { id: 'image', text: [0, 1], image: [1, 0] }];
    expect(rankPages([1, 0], pages, false)[0]!.id).toBe('text');
    expect(rankPages([1, 0], pages)[0]!.id).toBe('image');
    expect(fusionScore(1, 0)).toBe(1);
  });
  it('uses an inclusive supplied threshold and rejects invalid scores', () => {
    expect(meetsThreshold(0.5, 0.5)).toBe(true);
    expect(meetsThreshold(0.4, 0.5)).toBe(false);
    expect(meetsThreshold(NaN, 0)).toBe(false);
  });
});
describe('passages', () => {
  it('preserves decimal numbers, punctuation, and trailing sentences', () => {
    expect(splitSentences('  A change of 1.5%. Another claim! Last fragment  ')).toEqual(['A change of 1.5%.', 'Another claim!', 'Last fragment']);
    expect(splitSentences('')).toEqual([]);
  });
  it('picks the best sentence, keeps earliest ties and handles missing artifacts', () => {
    expect(bestSentenceIndex([1, 0], [[0, 1], [1, 0], [1, 0]])).toBe(1);
    expect(bestSentenceIndex([1], [])).toBeNull();
  });
});
describe('upload limits', () => {
  it('accepts the byte boundary and rejects oversize or empty uploads', () => {
    expect(() => validateUpload({ size: MAX_UPLOAD_BYTES })).not.toThrow();
    expect(() => validateUpload({ size: MAX_UPLOAD_BYTES + 1 })).toThrow('image-too-large');
    expect(() => validateUpload({ size: 0 })).toThrow('empty-image');
  });
  it('preserves aspect ratio without enlarging small images', () => {
    expect(downscaledDimensions(4096, 2048)).toEqual({ width: 2048, height: 1024 });
    expect(downscaledDimensions(100, 200)).toEqual({ width: 100, height: 200 });
    expect(() => downscaledDimensions(0, 100)).toThrow();
  });
});
it('audit persistence remains usable when storage throws', () => {
  vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } });
  expect(() => saveAuditLog([])).not.toThrow();
  expect(() => clearAuditLog()).not.toThrow();
  expect(appendAudit({ claimId: 'c', claimText: 'claim', pageId: 'p', pageTitle: 'page', score: 1, decision: 'confirm' })).toHaveLength(1);
});
