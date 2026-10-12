import { useRef, useState } from 'react';
import './App.css';
import { Header, LivePanel, PrivacyNote, liveError, similarity, useAutoResume, type LiveState } from './components/Chrome';
import { friendlyError } from './lib/errors';
import { MODEL_ID } from './lib/model';
import { CLAIMS, EVIDENCE_PAGES } from './lib/samples';
import { pageById, type EvidenceHit } from './lib/pages';
import { splitSentences } from './lib/passages';
import { RELATIONS, RELATION_LABEL, expectedRelation } from './lib/review';

// Model code (Transformers.js + ONNX Runtime) loads only when you opt in.
const liveMod = () => import('./lib/search');
import { appendAudit, clearAuditLog, formatAuditTime, judgmentsFor, loadAuditLog, type AuditDecision, type AuditEntry } from './lib/audit';
import examplesData from './data/examples.json';
import evalData from './data/eval.json';

type Current = { claimId: string | null; text: string; hits: EvidenceHit[]; source: 'example' | 'live' };

function exampleFor(claimId: string): Current {
  const c = CLAIMS.find((x) => x.id === claimId)!;
  const ex = examplesData.examples.find((e) => e.claimId === claimId)!;
  return { claimId, text: c.text, source: 'example', hits: ex.results.map((r) => ({ page: pageById(r.id), score: r.score, bestSentenceIndex: r.bestSentenceIndex ?? null })) };
}

// Measured by scripts/eval.mjs; shown as-is.
const EVAL = {
  count: evalData.count,
  fusionHits: evalData.results.filter((r) => r.fusionPageId === r.expectedPageId).length,
  textHits: evalData.results.filter((r) => r.textOnlyPageId === r.expectedPageId).length,
  contradicting: evalData.results.filter((r) => r.expectedRelation === 'contradicts').length,
};
// True when the stored page-image score never beat the text score in the examples.
const TEXT_ALWAYS_WINS = examplesData.examples.every((e) => e.results.every((r) => r.score === r.textScore));

const DECISION_LABEL: Record<AuditDecision, string> = { ...RELATION_LABEL, confirm: 'Supported (older log)', reject: 'Rejected (older log)' };

function Excerpt({ hit }: { hit: EvidenceHit }) {
  const sentences = splitSentences(hit.page.excerpt);
  const best = hit.bestSentenceIndex;
  if (best == null || !sentences[best]) return <p>{hit.page.excerpt}</p>;
  return (
    <p>
      {sentences.map((s, i) => (
        <span key={i}>{i > 0 ? ' ' : ''}{i === best ? <mark title="Closest sentence to the claim">{s}</mark> : s}</span>
      ))}
    </p>
  );
}

export default function App() {
  const [live, setLive] = useState<LiveState>({ kind: 'idle' });
  const [cur, setCur] = useState<Current>(() => exampleFor(CLAIMS[0]!.id));
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<AuditEntry[]>(() => loadAuditLog());
  const generation = useRef(0);
  const invalidate = () => { generation.current++; setBusy(false); setErr(null); };
  const ready = live.kind === 'ready';
  const claim = CLAIMS.find((c) => c.id === cur.claimId);
  const claimKey = cur.claimId ?? 'custom';
  const calls = judgmentsFor(log, claimKey, cur.text);
  const top = cur.hits[0];

  const startLive = async () => {
    setLive({ kind: 'loading', progress: null });
    try {
      setLive({ kind: 'loading', progress: null, step: 'Loading the model code…' });
      const { loadPages, loadEmbedder } = await liveMod();
      await loadPages();
      const info = await loadEmbedder((p) => setLive({ kind: 'loading', progress: p }));
      setLive({ kind: 'ready', device: info.device === 'webgpu' ? 'GPU' : 'CPU' });
    } catch (e) {
      setLive(liveError(e));
    }
  };
  useAutoResume(() => void startLive());

  const checkOwn = async () => {
    if (!own.trim()) return;
    const request = ++generation.current;
    const text = own.trim();
    setErr(null);
    setBusy(true);
    try {
      const hits = await (await liveMod()).findEvidenceForClaim(text);
      if (request !== generation.current) return;
      setCur({ claimId: null, text, hits, source: 'live' });
      setErr(null);
    } catch (e) {
      if (request === generation.current) setErr(friendlyError(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };

  const judge = (hit: EvidenceHit, decision: AuditDecision) => {
    setLog((prev) => appendAudit({ claimId: claimKey, claimText: cur.text, pageId: hit.page.id, pageTitle: hit.page.title, score: hit.score, decision }, prev));
  };

  const keyed = claim ? cur.hits.filter((h) => calls.has(h.page.id) && expectedRelation(claim, h.page.id)) : [];
  const agreed = keyed.filter((h) => calls.get(h.page.id) === expectedRelation(claim!, h.page.id)).length;

  return (
    <div className="page">
      <Header
        title="Evidence Finder"
        line="For people reviewing AI-written claims: pick a claim, see which source pages match it, then judge each page yourself."
        repo="hitl-evidence-finder"
      />
      <PrivacyNote />

      <h2 className="section-title">1. Pick a claim (instant, no download)</h2>
      <div className="chips" data-testid="examples">
        {CLAIMS.map((c) => (
          <button key={c.id} className="chip" aria-pressed={cur.claimId === c.id} onClick={() => { invalidate(); setCur(exampleFor(c.id)); }}>
            {c.text}
          </button>
        ))}
      </div>

      <LivePanel state={live} onStart={startLive} readyText="Write your own claim below." />
      <div className="row">
        <input type="text" data-testid="query" aria-label="Your own claim" value={own} disabled={!ready} onChange={(e) => { invalidate(); setOwn(e.target.value); }}
          onKeyDown={(e) => e.key === 'Enter' && !busy && void checkOwn()}
          placeholder={ready ? 'Type a claim to check against the pages' : 'Load the model above to check your own claim'} />
        <button className="btn" disabled={!ready || busy} onClick={() => void checkOwn()}>{busy ? 'Checking…' : 'Find evidence'}</button>
      </div>
      {err && <p className="err small" role="alert">{err}</p>}

      <h2 className="section-title">2. Read the evidence and make the call</h2>
      <p className="claim" data-testid="claim">"{cur.text}"</p>
      <p className="note">
        The model ranks the pages by how similar they are to the claim and highlights the closest sentence.
        It does not decide whether a page supports or contradicts the claim (there's no fact-checking model here). That's your call.
      </p>
      <div className="results" data-testid="results">
        {cur.hits.map((h, i) => {
          const mine = calls.get(h.page.id);
          const key = mine && claim ? expectedRelation(claim, h.page.id) : null;
          return (
            <div className="result" key={h.page.id}>
              <img src={h.page.src} alt="" />
              <div>
                <h3>{h.page.title} <span className="tag">page {h.page.pageNumber}</span>{i === 0 && <span className="tag">closest match</span>}</h3>
                <Excerpt hit={h} />
                <div className="judge" role="group" aria-label={`Your call on ${h.page.title}`}>
                  {RELATIONS.map((r) => (
                    <button key={r} className="chip" aria-pressed={mine === r} onClick={() => judge(h, r)}>{RELATION_LABEL[r]}</button>
                  ))}
                </div>
                {key && (
                  <p className={`small ${mine === key ? 'agree' : 'differ'}`}>
                    Answer key: {RELATION_LABEL[key]}. {mine === key ? 'You agree.' : 'Your call differs.'}
                  </p>
                )}
              </div>
              <span className="score" title="Cosine similarity between the claim and the page. Not a confidence or a truth score.">
                similarity {similarity(h.score)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="note">
        {cur.source === 'example' ? 'Precomputed by running the model at build time.' : 'Computed just now in your browser.'}
      </p>

      <h2 className="section-title">3. Your calls vs. the answer key</h2>
      {!claim ? (
        <p className="note">There's no answer key for claims you write yourself. Your calls are still saved in the review log.</p>
      ) : keyed.length === 0 ? (
        <p className="note">Judge a page above to compare your call with the answer key the demo author wrote for this claim.</p>
      ) : (
        <p className="note" data-testid="key-compare">
          You matched the answer key on <strong>{agreed} of {keyed.length}</strong> page{keyed.length === 1 ? '' : 's'} you judged
          {keyed.length < cur.hits.length ? ` (${cur.hits.length - keyed.length} left)` : ''}. The key was written by the demo author along with the claim.
        </p>
      )}

      {log.length > 0 && (
        <>
          <h2 className="section-title">Review log (stored only in this browser)</h2>
          <div className="results small">
            {log.slice(0, 8).map((e) => (
              <div key={e.id} className="muted">
                {formatAuditTime(e.at)} · {DECISION_LABEL[e.decision] ?? e.decision} · {e.claimText.slice(0, 80)} → {e.pageTitle}
              </div>
            ))}
          </div>
          <div className="row"><button className="btn" onClick={() => { clearAuditLog(); setLog([]); }}>Clear log</button></div>
        </>
      )}

      <h2 className="section-title">How well it works</h2>
      <p className="note" data-testid="eval">
        On {EVAL.count} held-out claims that were not used to build the examples, the closest match was the right page{' '}
        <strong>{EVAL.fusionHits} of {EVAL.count}</strong> times ({EVAL.textHits} of {EVAL.count} using the text alone).
        {' '}{EVAL.contradicting} of those claims contradict their page and still land on it, which is the point: finding the page is
        the model's job, judging it is yours. This only measures finding the right page among {EVIDENCE_PAGES.length} short demo pages on
        different topics, so it's an easy test, not proof that it works on real documents.
      </p>

      <h2 className="section-title">The source pages ({EVIDENCE_PAGES.length})</h2>
      <p className="note">
        Three short report pages written for this demo (not real publications), rendered as page images. Each page is matched on its
        text and on a stored embedding of its page image{TEXT_ALWAYS_WINS ? '; in the examples above the text match always scores higher' : ''}.
      </p>
      <div className="grid" data-testid="library">
        {EVIDENCE_PAGES.map((p) => (
          <div className={`card${top?.page.id === p.id ? ' hit' : ''}`} key={p.id}>
            <img src={p.src} alt={p.title} loading="lazy" />
            <h3>{p.title}</h3>
            <p>{p.sourceLabel} · page {p.pageNumber}</p>
          </div>
        ))}
      </div>
      <footer>Model: {MODEL_ID} via Transformers.js. Apache-2.0.</footer>
    </div>
  );
}
