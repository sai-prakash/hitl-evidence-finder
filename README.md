# Evidence Finder

**Pick an AI-written claim, see which source pages match it, and judge each page yourself: Supports, Contradicts or Not enough info.**

A small human-in-the-loop demo. [EmbeddingGemma 2](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX) ranks three short report pages by similarity to a claim and highlights the closest sentence on each page. The model does **not** decide whether a page supports or contradicts the claim; there is no entailment (NLI) model in this project. That call is the reviewer's, and it is saved in a review log that stays in the browser.

- Live demo: https://hitl-evidence-finder.vercel.app
- Case study (covers this demo and its two sister demos): https://saiprakash.design/work/multimodal-design-qa
- Sister demo: [UI Search](https://github.com/sai-prakash/ui-screenshot-search)

> **Demo GIF: TODO**

## What it does

1. **Pick a claim.** Five example claims (four the author marked as supported, one marked as misleading) show results instantly. These were computed ahead of time by running the model in Node (`src/data/examples.json`), so nothing is downloaded until you ask for it.
2. **Read the evidence.** All three pages are listed, closest first, with the raw cosine similarity (for example `0.88`). This is a similarity, not a confidence or truth score. The sentence on each page that is closest to the claim is highlighted.
3. **Make the call.** For each page, choose Supports, Contradicts or Not enough info. Each choice is stored per claim and page in `localStorage` (`src/lib/audit.ts`); choosing again replaces the earlier call.
4. **Compare with the answer key.** For the example claims, each page you judge is compared with an answer key derived from what the author wrote with the claim: the intended page supports a "supported" claim and contradicts a "misleading" one, and the other two pages (different topics) are "Not enough info". Claims you write yourself have no answer key.
5. **Try your own claim (optional).** "Run the model in your browser" downloads the model once and embeds your claim on your device. Page vectors are precomputed and fetched from `public/library-embeddings.json`.

## How well it works

Measured with `node scripts/eval.mjs`, results in `src/data/eval.json` (model `onnx-community/embeddinggemma-2-ONNX`, `q8`, Node, Transformers.js 4.3.1, onnxruntime CPU).

| Test | Result |
| --- | --- |
| Held-out claims | 15 (9 that agree with a page, 6 that contradict one) |
| Top-ranked page is the intended page, text + image score | 15 of 15 |
| Top-ranked page is the intended page, text score only | 15 of 15 |

From the five example claims in `src/data/examples.json`:

- The intended page ranks first for all 5. Top scores are 0.8055 to 0.8784; second place is 0.5731 to 0.6266.
- The misleading claim ("Arctic sea-ice extent has been essentially stable…") scores 0.8055 against the Arctic page, close to the true claim's 0.8784. Similarity finds the right page but can't tell support from contradiction, which is why the reviewer makes the call.
- The page-image score (weighted by 0.95) never beats the text score in any of the 15 claim/page pairs, so in practice the ranking comes from the text.

How it was measured: the held-out claims live in `scripts/eval-claims.json` and are not used by the precompute script or to tune anything. The eval embeds each claim with the retrieval query prefix, re-embeds the page text with the same runtime, and checks whether the top page matches `expectedPageId`, once with text only and once with `max(text, 0.95 × image)`. The `expectedRelation` labels are an answer key; nothing predicts them.

Caveats:

- The data is tiny and synthetic: 3 pages written for this demo, on 3 unrelated topics. 15 of 15 here is an easy test, not evidence it works on real documents.
- The only thing measured is finding the right page. Nothing in this project judges truth.
- There is no relevance cutoff, so an unrelated claim still gets a closest page. The 0.95 image weight is a heuristic and was not tuned on held-out data.
- All numbers come from the `q8` model on CPU. On a GPU the browser embeds your claim with `q4f16` against `q8` page vectors; that gap has not been measured.

## How it runs

| | |
| --- | --- |
| Model | [`onnx-community/embeddinggemma-2-ONNX`](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX), set once in `src/lib/model.ts` |
| Live queries | Text only. The audio and vision encoders are skipped (`src/lib/embedder.ts`), since page image vectors are precomputed. |
| With a GPU | WebGPU, `q4f16`. About 190 MB (sum of the text model and tokenizer file sizes). |
| Without a GPU | WASM on CPU, `q8`, using the CPU build of ONNX Runtime in `public/ort/`. About 360 MB (model, tokenizer and runtime). |
| GPU failure | If WebGPU fails while loading or warming up, the page reloads once in CPU mode and resumes on its own. Add `?simulateGpuFail` to test this. |
| Repeat visits | The browser's Cache API stores the model files, so later visits skip the download. Checked with a persistent Chromium profile: 0 model requests on the second load. There is no service worker, and the app is not designed to work offline. |
| Prompts | Pages: `title: … \| text: …`. Claims: `task: search result \| query: …`. |

Why the self-hosted CPU runtime: the ONNX Runtime build bundled with Transformers.js has no CPU kernel for `GatherBlockQuantized`, which every quantized EmbeddingGemma 2 file uses, so without a GPU the app points ONNX Runtime at the plain CPU WASM binary in `public/ort/`.

Privacy: claims you type are embedded on your device and never sent anywhere. The app is a static site; it downloads the model from Hugging Face and the Inter font from Google Fonts.

Model code (Transformers.js and ONNX Runtime) is loaded with a dynamic `import()` only after you opt in.

## Sample pages

Three "PDF page" SVGs in `public/samples/` (Arctic sea ice, renewables capacity, atmospheric CO₂). The text is synthetic demo text written for this repo, not official reports.

## Run locally

Requires Node 24.

```bash
npm install
npm run dev
```

WebGPU works best in Chrome or Edge.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check and production build |
| `npm run preview` | Preview the production build |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` | oxlint |

CI (`.github/workflows/ci.yml`) runs `tsc -b`, `vitest run` and `vite build`.

### Regenerate the precomputed data

Both scripts run the model in Node (`q8`, CPU) and need network access or a model cache.

```bash
npm i --no-save sharp && node scripts/precompute.mjs   # src/data/examples.json + public/library-embeddings.json
node scripts/eval.mjs                                  # src/data/eval.json
```

Rerun them after changing the pages or claims in `src/lib/samples.ts`, the page SVGs, or the model.

## Deploy

Static Vite output on Vercel. `vercel.json` sets COOP/COEP headers so the WASM runtime can use threads. `.npmrc` sets `ignore-scripts=true`.

## License

Apache-2.0, same as EmbeddingGemma 2. The sample page SVGs are original to this repo.
