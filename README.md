# HITL Evidence Finder

**Click an AI claim → retrieve the nearest PDF page image + text excerpt → confirm or reject.**

Demo 2 for Sai Prakash: a human-in-the-loop evidence finder that runs EmbeddingGemma 2 entirely in the browser (Transformers.js + WebGPU when available). Claims and a small synthetic PDF-page corpus share one embedding space; cosine similarity ranks evidence; decisions stay in a local audit trail.

Sister demo: [UI Search](https://github.com/sai-prakash/ui-screenshot-search) (multimodal design-system screenshot search).

## Live demo

https://hitl-evidence-finder.vercel.app

> **Demo GIF:** drop a short screen recording at `docs/demo.gif` and replace this note with `![HITL Evidence Finder demo](docs/demo.gif)`.

## Stack

React · TypeScript · Vite · Transformers.js · WebGPU · EmbeddingGemma 2

## Model

| Field | Value |
| --- | --- |
| **Model id** | [`onnx-community/embeddinggemma-2-ONNX`](https://huggingface.co/onnx-community/embeddinggemma-2-ONNX) |
| **Task** | Feature extraction (text; vision when load succeeds) |
| **Preferred device** | `webgpu` + `dtype: "q4f16"` (text + vision) |
| **Fallbacks** | WebGPU text-only → WASM `q8` text-only |
| **Encoders** | Audio always disabled; vision disabled automatically if multimodal load is flaky |

Document texts use the retrieval prefix `title: … | text: …`; claims use `task: search result | query: …`.

If you ever need the smaller text-only predecessor instead, change the constant in `src/lib/embedder.ts`:

```ts
export const MODEL_ID = 'onnx-community/embeddinggemma-300m-ONNX';
```

## Features

- Dark, pixel-clean UI titled **HITL Evidence Finder**
- Sample AI claims (supported + one deliberately misleading) — click to search
- Evidence rail with cosine scores, text excerpts, and PDF page preview
- Confirm / Reject HITL decisions with a local audit trail (`localStorage`)
- Privacy note: embeddings and audit log never leave the tab after model download
- First-load progress for model download + local indexing of demo pages

## Sample corpus

Three generated “PDF page” SVGs under `/public/samples/` (Arctic sea ice, renewables capacity, atmospheric CO₂). Passages are **synthetic demo text** for retrieval UX — not official agency reports.

## Run locally

```bash
npm install
npm run dev
```

Open the printed localhost URL (WebGPU works best in Chrome / Edge).

```bash
npm run build
npm run preview
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview the production build |

## Deploy

Set up for **Vercel** (static Vite output). `vercel.json` sets COOP/COEP headers for `SharedArrayBuffer` / WASM threads. `.npmrc` has `ignore-scripts=true` so `onnxruntime-node` postinstall never runs in the browser deploy path. Engines pin **Node 24.x**.

```bash
npx vercel --prod
```

Or connect `sai-prakash/hitl-evidence-finder` in the Vercel dashboard.

## Portfolio / Built card

Suggested 2-line copy for [saiprakash.design](https://saiprakash.design):

> **HITL Evidence Finder** — Click an AI claim, retrieve the nearest PDF page + excerpt in-browser.
> EmbeddingGemma 2 + Transformers.js + WebGPU; confirm/reject audit trail stays on-device.

## License

Apache-2.0 (compatible with EmbeddingGemma 2’s Apache-2.0 release).

Sample page SVGs in `/public/samples/` are original to this repo (synthetic demo documents).
