import { useRef, useState } from 'react';
import './App.css';
import { Header, LivePanel, PrivacyNote, liveError, pct, useAutoResume, type LiveState } from './components/Chrome';
import { friendlyError } from './lib/errors';
import { MODEL_ID } from './lib/model';
import { CLAIMS, EVIDENCE_PAGES } from './lib/samples';
import { pageById, type EvidenceHit } from './lib/pages';

// Model code (Transformers.js + ONNX Runtime) loads only when you opt in.
const liveMod = () => import('./lib/search');
import { appendAudit, clearAuditLog, formatAuditTime, loadAuditLog, type AuditEntry } from './lib/audit';
import examplesData from './data/examples.json';

type Current = { claimId: string | null; text: string; hits: EvidenceHit[]; source: 'example' | 'live' };

function exampleFor(claimId: string): Current {
  const c = CLAIMS.find((x) => x.id === claimId)!;
  const ex = examplesData.examples.find((e) => e.claimId === claimId)!;
  return { claimId, text: c.text, source: 'example', hits: ex.results.map((r) => ({ page: pageById(r.id), score: r.score, bestSentenceIndex: (r as { bestSentenceIndex?: number }).bestSentenceIndex ?? null })) };
}

const TONE_LABEL = { supported: 'supported', contested: 'contested', misleading: 'misleading' } as const;

export default function App() {
  const [live, setLive] = useState<LiveState>({ kind: 'idle' });
  const [cur, setCur] = useState<Current>(() => exampleFor(CLAIMS[0]!.id));
  const [showKey, setShowKey] = useState(false);
  const [own, setOwn] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<AuditEntry[]>(() => loadAuditLog());
  const generation = useRef(0);
  const invalidate = () => { generation.current++; setBusy(false); setErr(null); };
  const ready = live.kind === 'ready';
  const claim = CLAIMS.find((c) => c.id === cur.claimId);
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
      setShowKey(false);
      setErr(null);
    } catch (e) {
      if (request === generation.current) setErr(friendlyError(e));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };

  const decide = (decision: 'confirm' | 'reject') => {
    if (!top) return;
    setLog(appendAudit({ claimId: cur.claimId ?? 'custom', claimText: cur.text, pageId: top.page.id, pageTitle: top.page.title, score: top.score, decision }));
  };

  return (
    <div className="page">
      <Header
        title="Evidence Finder"
        line="For people reviewing AI-written claims: pick a claim, see which source page backs it up, then confirm or reject it yourself."
        repo="hitl-evidence-finder"
      />
      <PrivacyNote />

      <h2 className="section-title">1. Pick a claim (instant, no download)</h2>
      <div className="chips" data-testid="examples">
        {CLAIMS.map((c) => (
          <button key={c.id} className="chip" aria-pressed={cur.claimId === c.id} onClick={() => { invalidate(); setCur(exampleFor(c.id)); setShowKey(false); }}>
            {c.text}
          </button>
        ))}
      </div>

      <LivePanel state={live} onStart={startLive} readyText="Write your own claim below." />
      <div className="row">
        <input type="text" data-testid="query" value={own} disabled={!ready} onChange={(e) => { invalidate(); setOwn(e.target.value); }}
          onKeyDown={(e) => e.key === 'Enter' && void checkOwn()}
          placeholder={ready ? 'Type a claim to check against the pages' : 'Load the model above to check your own claim'} />
        <button className="btn" disabled={!ready || busy} onClick={() => void checkOwn()}>{busy ? 'Checking…' : 'Find evidence'}</button>
      </div>
      {err && <p className="err small" role="alert">{err}</p>}

      <h2 className="section-title">2. Evidence for: "{cur.text}"</h2>
      <div className="results" data-testid="results">
        {cur.hits.map((h, i) => (
          <div className="result" key={h.page.id}>
            <img src={h.page.src} alt="" />
            <div>
              <h3>{i === 0 ? 'Best match: ' : ''}{h.page.title} <span className="tag">page {h.page.pageNumber}</span></h3>
              <p>{h.page.excerpt}</p>
            </div>
            <span className="score">{pct(h.score)}</span>
          </div>
        ))}
      </div>
      <p className="note">
        {cur.source === 'example' ? 'Precomputed by running the model at build time.' : 'Computed just now in your browser.'}{' '}
        The model only finds the most relevant page. It doesn't judge whether the claim is true. That's your call.
      </p>

      <h2 className="section-title">3. Your decision</h2>
      <div className="row">
        <button className="btn" onClick={() => decide('confirm')}>Page supports the claim</button>
        <button className="btn" onClick={() => decide('reject')}>Page contradicts it / not enough</button>
        {claim && (
          <button className="btn" onClick={() => setShowKey((v) => !v)}>
            {showKey ? 'Hide answer key' : 'Show answer key'}
          </button>
        )}
      </div>
      {claim && showKey && (
        <p className="note">Answer key (written by the demo author when the claim was made up): <strong>{TONE_LABEL[claim.tone]}</strong>.</p>
      )}
      {log.length > 0 && (
        <>
          <h2 className="section-title">Review log (stored only in this browser)</h2>
          <div className="results small">
            {log.slice(0, 8).map((e) => (
              <div key={e.id} className="muted">
                {formatAuditTime(e.at)} · {e.decision === 'confirm' ? 'Supported' : 'Rejected'} · {e.claimText.slice(0, 80)} → {e.pageTitle}
              </div>
            ))}
          </div>
          <div className="row"><button className="btn" onClick={() => { clearAuditLog(); setLog([]); }}>Clear log</button></div>
        </>
      )}

      <h2 className="section-title">The source pages ({EVIDENCE_PAGES.length})</h2>
      <p className="note">Three short report pages written for this demo (not real publications), rendered as page images. The model searches both their text and the page image.</p>
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
