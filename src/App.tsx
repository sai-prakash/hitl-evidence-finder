import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import {
  appendAudit,
  clearAuditLog,
  formatAuditTime,
  loadAuditLog,
  type AuditEntry,
} from './lib/audit';
import {
  MODEL_ID,
  loadEmbedder,
  type EmbedderProgress,
} from './lib/embedder';
import { CLAIMS, EVIDENCE_PAGES, type Claim } from './lib/samples';
import {
  buildIndex,
  findEvidenceForClaim,
  type EvidenceHit,
} from './lib/search';

type Phase = 'boot' | 'model' | 'index' | 'ready' | 'error';

function formatBytes(n?: number): string {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function toneLabel(tone: Claim['tone']): string {
  if (tone === 'supported') return 'likely supported';
  if (tone === 'misleading') return 'likely misleading';
  return 'contested';
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [progress, setProgress] = useState<EmbedderProgress | null>(null);
  const [indexProgress, setIndexProgress] = useState({
    done: 0,
    total: EVIDENCE_PAGES.length,
    label: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
  const [hits, setHits] = useState<EvidenceHit[] | null>(null);
  const [activeHitId, setActiveHitId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const booted = useRef(false);

  useEffect(() => {
    setAudit(loadAuditLog());
  }, []);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    (async () => {
      try {
        setPhase('model');
        const info = await loadEmbedder((p) => setProgress(p));
        setDeviceLabel(
          `${info.device} · ${info.dtype} · ${info.vision ? 'text+vision' : 'text-only'}`,
        );
        setPhase('index');
        await buildIndex((done, total, label) => {
          setIndexProgress({ done, total, label });
        });
        setPhase('ready');
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
        setPhase('error');
      }
    })();
  }, []);

  const progressPct = useMemo(() => {
    if (phase === 'model') {
      return Math.min(100, Math.max(0, progress?.progress ?? 0));
    }
    if (phase === 'index') {
      return (indexProgress.done / Math.max(1, indexProgress.total)) * 100;
    }
    return phase === 'ready' ? 100 : 0;
  }, [phase, progress, indexProgress]);

  const selectedClaim = CLAIMS.find((c) => c.id === selectedClaimId) ?? null;
  const activeHit =
    hits?.find((h) => h.id === activeHitId) ?? hits?.[0] ?? null;

  const runClaimSearch = useCallback(async (claim: Claim) => {
    setSelectedClaimId(claim.id);
    setSearching(true);
    setError(null);
    try {
      const results = await findEvidenceForClaim(claim.text, 3);
      setHits(results);
      setActiveHitId(results[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setHits(null);
      setActiveHitId(null);
    } finally {
      setSearching(false);
    }
  }, []);

  const recordDecision = useCallback(
    (decision: 'confirm' | 'reject') => {
      if (!selectedClaim || !activeHit) return;
      const next = appendAudit({
        claimId: selectedClaim.id,
        claimText: selectedClaim.text,
        pageId: activeHit.id,
        pageTitle: activeHit.title,
        score: activeHit.score,
        decision,
      });
      setAudit(next);
    },
    [selectedClaim, activeHit],
  );

  const statusText =
    phase === 'boot'
      ? 'Starting…'
      : phase === 'model'
        ? `Downloading ${MODEL_ID}`
        : phase === 'index'
          ? `Indexing ${indexProgress.label || 'pages'} (${indexProgress.done}/${indexProgress.total})`
          : phase === 'ready'
            ? 'Ready'
            : 'Failed to load';

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-top">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              human-in-the-loop · on-device embeddings
            </div>
            <h1>HITL Evidence Finder</h1>
            <p className="subtitle">
              Click an AI claim to retrieve the nearest PDF page image and text
              excerpt from a shared embedding space. Confirm or reject matches
              to build a local audit trail — all in your browser.
            </p>
          </div>
          <aside className="privacy">
            <strong>Privacy</strong>
            <div>
              Model download caches in your browser. Embeddings, rankings, and
              the confirm/reject log never leave this tab (audit log stays in
              localStorage).
            </div>
          </aside>
        </div>
        <div className="chips">
          {[
            'React',
            'TypeScript',
            'Transformers.js',
            'WebGPU',
            'EmbeddingGemma',
            'HITL',
          ].map((chip) => (
            <span className="chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      </header>

      {(phase !== 'ready' || error) && (
        <section className="panel status-panel">
          {phase !== 'ready' && phase !== 'error' && (
            <div className="status">
              <div className="status-title">
                <span>{statusText}</span>
                <span>{Math.round(progressPct)}%</span>
              </div>
              <div className="bar">
                <span style={{ width: `${progressPct}%` }} />
              </div>
              <div className="meta">
                {phase === 'model' && (
                  <>
                    {progress?.file ? `${progress.file} · ` : ''}
                    {formatBytes(progress?.loaded)}
                    {progress?.total ? ` / ${formatBytes(progress.total)}` : ''}
                  </>
                )}
                {phase === 'index' &&
                  'Embedding PDF page passages (and images when vision loads) locally…'}
              </div>
            </div>
          )}
          {phase === 'error' && (
            <div className="status">
              <div className="status-title">
                <span style={{ color: 'var(--danger)' }}>Load failed</span>
              </div>
              <div className="meta">{error}</div>
            </div>
          )}
          {phase === 'ready' && error && (
            <div className="status">
              <div className="status-title">
                <span style={{ color: 'var(--danger)' }}>Search error</span>
              </div>
              <div className="meta">{error}</div>
            </div>
          )}
        </section>
      )}

      <div className="workspace">
        <section className="panel claims-panel">
          <div className="panel-head">
            <h2>AI claims</h2>
            <span>{CLAIMS.length} sample claims</span>
          </div>
          <ul className="claim-list">
            {CLAIMS.map((claim) => {
              const active = claim.id === selectedClaimId;
              return (
                <li key={claim.id}>
                  <button
                    type="button"
                    className={`claim-btn${active ? ' active' : ''}`}
                    disabled={phase !== 'ready' || searching}
                    onClick={() => void runClaimSearch(claim)}
                  >
                    <span className={`tone tone-${claim.tone}`}>
                      {toneLabel(claim.tone)}
                    </span>
                    <span className="claim-text">{claim.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="hint">
            Model: <code>{MODEL_ID}</code>
            {deviceLabel ? ` · ${deviceLabel}` : ''}
          </p>
        </section>

        <section className="panel evidence-panel">
          <div className="panel-head">
            <h2>Evidence rail</h2>
            <span>
              {searching
                ? 'Searching…'
                : hits
                  ? `${hits.length} nearest pages`
                  : 'Select a claim'}
            </span>
          </div>

          {!hits && (
            <div className="empty">
              Pick a claim on the left. EmbeddingGemma ranks the demo PDF corpus
              by cosine similarity in a shared space.
            </div>
          )}

          {hits && (
            <div className="evidence-layout">
              <div className="hit-list">
                {hits.map((hit, i) => (
                  <button
                    type="button"
                    key={hit.id}
                    className={`hit-card${hit.id === activeHit?.id ? ' active' : ''}`}
                    onClick={() => setActiveHitId(hit.id)}
                  >
                    <div className="hit-top">
                      <span className="rank">#{i + 1}</span>
                      <span className="score">{(hit.score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="hit-title">{hit.title}</div>
                    <div className="hit-meta">
                      {hit.sourceLabel} · p.{hit.pageNumber} · {hit.match}
                    </div>
                    <p className="hit-excerpt">{hit.excerpt}</p>
                  </button>
                ))}
              </div>

              {activeHit && (
                <div className="page-preview">
                  <div className="page-frame">
                    <img
                      src={activeHit.src}
                      alt={activeHit.title}
                      loading="lazy"
                    />
                  </div>
                  <div className="page-actions">
                    <div>
                      <div className="page-actions-title">HITL decision</div>
                      <div className="meta">
                        Does this page support the selected claim?
                      </div>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn btn-success"
                        disabled={!selectedClaim}
                        onClick={() => recordDecision('confirm')}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        disabled={!selectedClaim}
                        onClick={() => recordDecision('reject')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <section className="panel audit-panel">
        <div className="panel-head">
          <h2>Audit trail</h2>
          <div className="audit-actions">
            <span>{audit.length} entries · local only</span>
            {audit.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  clearAuditLog();
                  setAudit([]);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {audit.length === 0 ? (
          <div className="empty compact">
            Confirm or reject a match to append a decision here.
          </div>
        ) : (
          <ul className="audit-list">
            {audit.map((entry) => (
              <li key={entry.id} className={`audit-item decision-${entry.decision}`}>
                <div className="audit-badge">{entry.decision}</div>
                <div className="audit-body">
                  <div className="audit-claim">{entry.claimText}</div>
                  <div className="audit-meta">
                    → {entry.pageTitle} · {(entry.score * 100).toFixed(1)}% ·{' '}
                    {formatAuditTime(entry.at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="footer">
        <span>
          Built for portfolio use · Apache-2.0 · embeddings via Transformers.js
        </span>
        <a
          href="https://github.com/sai-prakash/hitl-evidence-finder"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
