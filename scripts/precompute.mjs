import { splitSentences, bestSentenceIndex } from '../src/lib/passages.ts';
import { load, embedText, embedSvg, cos, round, meta, write, importTs } from './precompute-core.mjs';
const { EVIDENCE_PAGES, CLAIMS, pageDocumentText, claimQueryText } = await importTs('src/lib/samples.ts');
await load();
const pages = [];
for (const p of EVIDENCE_PAGES) pages.push({ id: p.id, text: await embedText(pageDocumentText(p)), image: await embedSvg(p.src), sentences: await Promise.all(splitSentences(p.excerpt).map((s) => embedText('title: ' + p.title + ' | text: ' + s))) });
const examples = [];
for (const c of CLAIMS) {
  const e = await embedText(claimQueryText(c.text));
  const ranked = pages.map((p) => {
    const textScore = cos(e, p.text), imageScore = cos(e, p.image);
    return { id: p.id, bestSentenceIndex: bestSentenceIndex(e, p.sentences), score: +Math.max(textScore, imageScore * 0.95).toFixed(4), textScore: +textScore.toFixed(4), imageScore: +imageScore.toFixed(4) };
  }).sort((a, b) => b.score - a.score);
  examples.push({ claimId: c.id, results: ranked });
  console.log(c.id, '->', ranked.map((r) => `${r.id} ${r.score}`).join(', '));
}
write('src/data/examples.json', { ...meta(), examples });
write('public/library-embeddings.json', { ...meta(), pages: pages.map((p) => ({ id: p.id, text: round(p.text), image: round(p.image), sentences: p.sentences.map(round) })) });
