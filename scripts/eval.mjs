// Run with Node 24: node scripts/eval.mjs (requires cached model or network).
// Frozen held-out claims are never used by precompute or to tune fusion.
import fs from 'node:fs';
import path from 'node:path';
import { load, embedText, meta, write, ROOT, importTs } from './precompute-core.mjs';
import { rankPages } from '../src/lib/scoring.ts';
const { claimQueryText, EVIDENCE_PAGES, pageDocumentText } = await importTs('src/lib/samples.ts');
const claims = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/eval-claims.json'), 'utf8'));
const library = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/library-embeddings.json'), 'utf8'));
await load();
// Re-embed text pages with the same runtime as queries; image vectors remain precomputed.
const pages = await Promise.all(EVIDENCE_PAGES.map(async (p) => {
  const stored = library.pages.find((entry) => entry.id === p.id);
  if (!stored) throw new Error('Missing page embedding: ' + p.id);
  return { ...stored, text: await embedText(pageDocumentText(p)) };
}));
const results = [];
for (const claim of claims) {
  if (!pages.some((p) => p.id === claim.expectedPageId) || !['supports', 'contradicts'].includes(claim.expectedRelation)) {
    throw new Error('Invalid evaluation claim: ' + claim.id);
  }
  const query = await embedText(claimQueryText(claim.text));
  const textOnly = rankPages(query, pages, false)[0].id;
  const fusion = rankPages(query, pages, true)[0].id;
  results.push({ ...claim, textOnlyPageId: textOnly, fusionPageId: fusion });
}
const accuracy = (key) => results.filter((r) => r[key] === r.expectedPageId).length / results.length;
const report = {
  ...meta(), task: 'Top-1 page retrieval; relation labels are an answer key, not predicted verdicts.',
  count: results.length,
  textOnlyAccuracy: accuracy('textOnlyPageId'),
  fusionAccuracy: accuracy('fusionPageId'),
  results,
};
write('src/data/eval.json', report);
console.log(JSON.stringify({ count: report.count, textOnlyAccuracy: report.textOnlyAccuracy, fusionAccuracy: report.fusionAccuracy }, null, 2));
