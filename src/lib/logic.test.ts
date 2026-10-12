import { describe, expect, it, vi, afterEach } from 'vitest';
import { cosineSimilarity, fusionScore, rankPages, meetsThreshold } from './scoring';
import { splitSentences, bestSentenceIndex } from './passages';
import { MAX_UPLOAD_BYTES, validateUpload, downscaledDimensions } from './image-limits';
import { saveAuditLog, clearAuditLog, appendAudit, judgmentsFor } from './audit';
import { expectedRelation } from './review';

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
describe('reviewer judgments', () => {
  it('derives the answer key from the claim tone and expected page', () => {
    expect(expectedRelation({ tone: 'supported', expectedPageId: 'a' }, 'a')).toBe('supports');
    expect(expectedRelation({ tone: 'misleading', expectedPageId: 'a' }, 'a')).toBe('contradicts');
    expect(expectedRelation({ tone: 'supported', expectedPageId: 'a' }, 'b')).toBe('not-enough-info');
    expect(expectedRelation({ tone: 'contested', expectedPageId: 'a' }, 'a')).toBeNull();
    expect(expectedRelation({ tone: 'supported' }, 'a')).toBeNull();
  });
  it('keeps one judgment per claim and page, newest first', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) });
    const base = { claimId: 'c', claimText: 'claim', pageTitle: 'page', score: 0.5 };
    appendAudit({ ...base, pageId: 'p1', decision: 'supports' });
    appendAudit({ ...base, pageId: 'p2', decision: 'not-enough-info' });
    const log = appendAudit({ ...base, pageId: 'p1', decision: 'contradicts' });
    expect(log).toHaveLength(2);
    const calls = judgmentsFor(log, 'c', 'claim');
    expect(calls.get('p1')).toBe('contradicts');
    expect(calls.get('p2')).toBe('not-enough-info');
    expect(judgmentsFor(log, 'custom', 'claim').size).toBe(0);
  });
});
it('audit persistence remains usable when storage throws', () => {
  vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } });
  expect(() => saveAuditLog([])).not.toThrow();
  expect(() => clearAuditLog()).not.toThrow();
  expect(appendAudit({ claimId: 'c', claimText: 'claim', pageId: 'p', pageTitle: 'page', score: 1, decision: 'confirm' })).toHaveLength(1);
});
