import {
  AutoConfig,
  AutoModel,
  AutoProcessor,
  type PreTrainedModel,
  type Processor,
  type ProgressCallback,
  type RawImage,
  type Tensor,
} from '@huggingface/transformers';
import { loadImageForEmbedding } from './image';

/**
 * EmbeddingGemma 2 ONNX (multimodal text + image).
 * Prefer full multimodal; fall back to text-only if vision is flaky.
 */
export const MODEL_ID = 'onnx-community/embeddinggemma-2-ONNX';

export type DType =
  | 'auto'
  | 'fp32'
  | 'fp16'
  | 'q8'
  | 'int8'
  | 'uint8'
  | 'q4'
  | 'bnb4'
  | 'q4f16'
  | 'q2'
  | 'q2f16'
  | 'q1'
  | 'q1f16';

export type DeviceInfo = {
  device: 'webgpu' | 'wasm';
  dtype: DType;
  /** False when vision encoder was disabled for a text-only load. */
  vision: boolean;
};

export type EmbedderProgress = {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

type ProgressPayload = Parameters<ProgressCallback>[0];

let model: PreTrainedModel | null = null;
let processor: Processor | null = null;
let deviceInfo: DeviceInfo | null = null;
let loadPromise: Promise<DeviceInfo> | null = null;

function toPercent(data: ProgressPayload): number | undefined {
  if (
    typeof data === 'object' &&
    data !== null &&
    'progress' in data &&
    typeof (data as { progress?: unknown }).progress === 'number'
  ) {
    return (data as { progress: number }).progress;
  }
  return undefined;
}

function progressCb(onProgress?: (p: EmbedderProgress) => void): ProgressCallback {
  return ((data: ProgressPayload) => {
    onProgress?.({
      status: String((data as { status?: string }).status ?? 'download'),
      file: (data as { file?: string }).file,
      progress: toPercent(data),
      loaded: (data as { loaded?: number }).loaded,
      total: (data as { total?: number }).total,
    });
  }) as ProgressCallback;
}

async function loadWith(
  device: 'webgpu' | 'wasm',
  dtype: DType,
  vision: boolean,
  onProgress?: (p: EmbedderProgress) => void,
): Promise<DeviceInfo> {
  const config = await AutoConfig.from_pretrained(MODEL_ID);
  // Always skip audio (~300M params).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (config as any).audio_config = null;
  if (!vision) {
    // Text-only path when vision is flaky or unavailable.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).vision_config = null;
  }

  processor = await AutoProcessor.from_pretrained(MODEL_ID, {
    progress_callback: progressCb(onProgress),
  });

  model = await AutoModel.from_pretrained(MODEL_ID, {
    config,
    device,
    dtype,
    progress_callback: progressCb(onProgress),
  });

  deviceInfo = { device, dtype, vision };
  return deviceInfo;
}

/**
 * Prefer WebGPU + q4f16 multimodal; then WebGPU text-only; then WASM text-only.
 */
export async function loadEmbedder(
  onProgress?: (p: EmbedderProgress) => void,
): Promise<DeviceInfo> {
  if (deviceInfo && model && processor) return deviceInfo;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      onProgress?.({ status: 'loading', file: 'webgpu / q4f16 (text+vision)' });
      return await loadWith('webgpu', 'q4f16', true, onProgress);
    } catch (err) {
      console.warn('[embedder] multimodal webgpu failed; trying text-only webgpu', err);
      model = null;
      processor = null;
    }

    try {
      onProgress?.({ status: 'loading', file: 'webgpu / q4f16 (text-only)' });
      return await loadWith('webgpu', 'q4f16', false, onProgress);
    } catch (err) {
      console.warn('[embedder] text-only webgpu failed; falling back to wasm/q8', err);
      model = null;
      processor = null;
    }

    onProgress?.({ status: 'loading', file: 'wasm / q8 (text-only fallback)' });
    return await loadWith('wasm', 'q8', false, onProgress);
  })();

  try {
    return await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

export function getDeviceInfo(): DeviceInfo | null {
  return deviceInfo;
}

export function hasVision(): boolean {
  return Boolean(deviceInfo?.vision);
}

async function embeddingFromInputs(
  text: string | string[] | null,
  images?: RawImage | RawImage[] | null,
): Promise<Float32Array> {
  if (!model || !processor) {
    throw new Error('Embedder not loaded');
  }
  const inputs = await processor(text, images ?? null);
  const out = await model(inputs);
  const emb = (out as { sentence_embedding: Tensor }).sentence_embedding;
  const data = emb.data as Float32Array | number[];
  const dims = emb.dims;
  if (dims.length === 2 && dims[0]! > 1) {
    const dim = dims[1]!;
    return Float32Array.from(Array.from(data).slice(0, dim));
  }
  return data instanceof Float32Array ? data : Float32Array.from(data);
}

export async function embedText(text: string): Promise<Float32Array> {
  return embeddingFromInputs(text);
}

export async function embedImageUrl(url: string): Promise<Float32Array> {
  if (!hasVision()) {
    throw new Error('Vision encoder not loaded — text-only mode');
  }
  const image = await loadImageForEmbedding(url);
  return embeddingFromInputs(null, image);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
