TODO(orchestrator): use Node 24 and a model cache or network access to run:
- node scripts/precompute.mjs
- node scripts/eval.mjs

Precompute remains multimodal. It adds sentence embeddings to the library and
bestSentenceIndex to each example result. Existing committed examples remain
usable until regeneration; missing sentence metadata is represented by null.
The UI implementation can consume EvidenceHit.bestSentenceIndex and splitSentences.

Eval writes src/data/eval.json with measured text-only and fusion top-1 retrieval
accuracy. No evaluation artifact is supplied before running the model. Relation
labels are held-out answer keys; this harness does not predict entailment.
These claims evaluate the existing synthetic corpus, not general evidence quality.
The existing fusion weight remains a heuristic; no calibrated relevance threshold
has been chosen. meetsThreshold tests supplied boundaries only.

Measure the text-only live model's actual transfer sizes before restoring size
copy in Chrome.tsx. Verify WebGPU warm-up failure and CPU reload/auto-resume in
a browser; this environment cannot exercise those inference runtimes.
There is no upload UI in this repository; the existing image-loading helper now
enforces upload limits and decoded-image downscaling.
