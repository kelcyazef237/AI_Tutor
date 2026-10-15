import type { AIErrorKind } from '@psc/shared';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  /** JSON schema to request structured output; providers may ignore it. */
  schema?: object;
  temperature?: number;
  timeoutMs?: number;
}

/**
 * Minimal transport-level provider. Higher-level operations
 * (generateQuestion, evaluate, simulateStep, …) live in ./operations.ts
 * and are provider-agnostic.
 */
export interface AIProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<string>;
  listModels(): Promise<string[]>;
}

export class AIError extends Error {
  constructor(
    public kind: AIErrorKind,
    message: string,
    public model?: string,
  ) {
    super(message);
    this.name = 'AIError';
  }
  /** Whether trying a different model could help. */
  get retryableWithOtherModel() {
    return this.kind === 'unavailable' || this.kind === 'invalid_output' || this.kind === 'timeout';
  }
}

export function classifyHttpError(status: number, body: string, model?: string): AIError {
  const text = body.slice(0, 500);
  const lower = text.toLowerCase();
  if (status === 429 || lower.includes('usage limit') || lower.includes('quota') || lower.includes('rate limit'))
    return new AIError('quota', extractMessage(text) || 'Usage limit reached for the AI provider.', model);
  if (status === 401 || status === 403 || lower.includes('unauthorized'))
    return new AIError('auth', extractMessage(text) || 'Not authorized with the AI provider.', model);
  if (status === 404 || lower.includes('not found'))
    return new AIError('unavailable', `Model not found: ${model ?? ''}`.trim(), model);
  return new AIError('unavailable', `HTTP ${status}: ${extractMessage(text) || 'request failed'}`, model);
}

function extractMessage(body: string): string {
  try {
    const j = JSON.parse(body) as { error?: string | { message?: string } };
    if (typeof j.error === 'string') return j.error;
    if (j.error && typeof j.error.message === 'string') return j.error.message;
  } catch {
    /* not JSON */
  }
  return body.trim();
}

export function classifyFetchError(e: unknown, model?: string): AIError {
  if (e instanceof AIError) return e;
  const err = e as { name?: string; message?: string; cause?: { code?: string } };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return new AIError('timeout', 'The model took too long to respond.', model);
  const code = err?.cause?.code;
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH')
    return new AIError('unavailable', 'Cannot reach the AI provider. Is Ollama running?', model);
  return new AIError('unknown', err?.message ?? String(e), model);
}
