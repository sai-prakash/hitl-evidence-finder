import { useEffect, useState } from 'react';
import { detectWebGPU, AUTO_RESUME_KEY } from '../lib/gpu';
import { friendlyError, GpuFailedError } from '../lib/errors';

export type EmbedderProgress = { file?: string; loaded: number; total: number };

/** If the page just reloaded itself into CPU mode, start the live model again automatically. */
export function useAutoResume(start: () => void) {
  useEffect(() => {
    if (sessionStorage.getItem(AUTO_RESUME_KEY) === '1') {
      sessionStorage.removeItem(AUTO_RESUME_KEY);
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Map a live-load failure to UI state; a GPU failure reloads once into CPU mode. */
export function liveError(err: unknown): LiveState {
  console.error(err);
  if (err instanceof GpuFailedError) {
    window.setTimeout(() => location.reload(), 1200);
    return { kind: 'loading', progress: null, step: friendlyError(err) };
  }
  return { kind: 'error', message: friendlyError(err) };
}

const CASE_STUDY = 'https://saiprakash.design/work/multimodal-design-qa';

export function Header(props: { title: string; line: string; repo: string }) {
  return (
    <header className="hdr">
      <div>
        <h1>{props.title}</h1>
        <p className="lede">{props.line}</p>
      </div>
      <nav className="hdr-links">
        <a href={CASE_STUDY} title="One case study covers this demo and its two sister demos">Case study (3 demos)</a>
        <a href={`https://github.com/sai-prakash/${props.repo}`}>GitHub</a>
      </nav>
    </header>
  );
}

export function PrivacyNote() {
  return (
    <p className="privacy">
      <strong>Privacy:</strong> nothing you type leaves your browser. The examples are
      precomputed; the live model runs on your device and there is no server.
    </p>
  );
}

// Text-only model files (vision encoder skipped). GPU: q4f16 weights. CPU: q8 weights plus the self-hosted ONNX Runtime WASM.
const DOWNLOAD_GPU = 'about 190 MB';
const DOWNLOAD_CPU = 'about 360 MB';

export type LiveState =
  | { kind: 'idle' }
  | { kind: 'loading'; progress: EmbedderProgress | null; step?: string }
  | { kind: 'ready'; device: string }
  | { kind: 'error'; message: string };

export function LivePanel(props: {
  state: LiveState;
  onStart: () => void;
  readyText: string;
}) {
  const [gpu, setGpu] = useState<boolean | null>(null);
  useEffect(() => {
    void detectWebGPU().then(setGpu);
  }, []);
  const s = props.state;
  return (
    <section className="live" aria-live="polite">
      {s.kind === 'idle' && (
        <>
          <button className="btn primary" onClick={props.onStart} data-testid="run-live">
            Run the model in your browser (one-time download)
          </button>
          <p className="muted small">
            {gpu === false
              ? `No GPU found, so it will run on your CPU (${DOWNLOAD_CPU}). It's slower but it works.`
              : `Uses your GPU if available (${DOWNLOAD_GPU}, or ${DOWNLOAD_CPU} if it falls back to your CPU).`}{' '}
            Your browser caches the files, so later visits skip the download.
          </p>
        </>
      )}
      {s.kind === 'loading' && (
        <div>
          <p>
            {s.step ??
              (s.progress && s.progress.total
                ? `Downloading the model… ${Math.round((s.progress.loaded / 1e6))} of ${Math.round(s.progress.total / 1e6)} MB`
                : 'Starting the model…')}
          </p>
          <div className="bar">
            <span
              style={{
                width: `${s.progress && s.progress.total ? (100 * s.progress.loaded) / s.progress.total : 3}%`,
              }}
            />
          </div>
        </div>
      )}
      {s.kind === 'ready' && (
        <p className="ok" data-testid="live-ready">
          Model running in your browser ({s.device}). {props.readyText}
        </p>
      )}
      {s.kind === 'error' && (
        <div className="err" role="alert">
          <p>{s.message}</p>
          <button className="btn" onClick={() => location.reload()}>
            Reload and try again
          </button>
        </div>
      )}
    </section>
  );
}

/** Raw cosine similarity, not a percentage: it is not a confidence score. */
export function similarity(n: number) {
  return n.toFixed(2);
}
