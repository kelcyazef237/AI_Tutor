import { z } from 'zod';
import type { AIStatus } from '@psc/shared';
import { AIError, type AIProvider, type ChatMessage } from './provider';

/** Global, in-memory AI health surfaced to the UI banner. */
export const aiStatus: AIStatus = { ok: true, provider: 'ollama', checkedAt: 0 };

/** Optional persistence hook so quota/auth errors survive server restarts. */
let persist: ((s: AIStatus) => void) | null = null;
export function setStatusPersistence(load: () => AIStatus | null, save: (s: AIStatus) => void) {
  const saved = load();
  if (saved) Object.assign(aiStatus, saved);
  persist = save;
}

export function recordSuccess(provider: string) {
  Object.assign(aiStatus, { ok: true, provider, kind: undefined, message: undefined, checkedAt: Date.now() });
  persist?.(aiStatus);
}
export function recordFailure(provider: string, e: AIError) {
  Object.assign(aiStatus, { ok: false, provider, kind: e.kind, message: e.message, checkedAt: Date.now() });
  persist?.(aiStatus);
}

/** Reachability-only check passed: refresh the timestamp without clearing a quota/auth error. */
export function touchStatus() {
  aiStatus.checkedAt = Date.now();
}

/** Extract the first balanced JSON object from model text (handles ``` fences and prose). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text].filter(Boolean) as string[];
  for (const cand of candidates) {
    const start = cand.indexOf('{');
    if (start < 0) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < cand.length; i++) {
      const ch = cand[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          const slice = cand.slice(start, i + 1);
          try {
            return JSON.parse(slice);
          } catch {
            // try removing trailing commas
            try {
              return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
            } catch {
              break;
            }
          }
        }
      }
    }
  }
  throw new Error('No JSON object found in model output');
}

export function jsonSchemaOf(schema: z.ZodType): object | undefined {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as object;
  } catch {
    return undefined;
  }
}

export interface StructuredCall<T extends z.ZodType> {
  provider: AIProvider;
  models: string[];
  schema: T;
  messages: ChatMessage[];
  temperature?: number;
  timeoutMs?: number;
}

/**
 * validate → repair → fallback.
 *  1. Ask the model (with JSON schema when supported).
 *  2. Extract + Zod-validate. On failure, ask the same model once to repair.
 *  3. On unavailable/invalid/timeout, try the next model in the chain.
 *  Quota/auth errors abort immediately (they are account-wide).
 */
export async function callStructured<T extends z.ZodType>(call: StructuredCall<T>): Promise<{ data: z.infer<T>; model: string }> {
  const schemaJson = jsonSchemaOf(call.schema);
  const models = [...new Set(call.models.filter(Boolean))];
  let lastErr: AIError = new AIError('unavailable', 'No models configured.');

  for (const model of models) {
    try {
      const raw = await call.provider.chat({
        model,
        messages: call.messages,
        schema: schemaJson,
        temperature: call.temperature,
        timeoutMs: call.timeoutMs,
      });
      const first = tryParse(call.schema, raw);
      if (first.ok) {
        recordSuccess(call.provider.name);
        return { data: first.data, model };
      }
      // Repair attempt
      const repaired = await call.provider.chat({
        model,
        messages: [
          ...call.messages,
          { role: 'assistant', content: raw.slice(0, 6000) },
          {
            role: 'user',
            content: `Your previous output was not valid. Problems:\n${first.error}\n\nReturn ONLY a single corrected JSON object that satisfies the required schema. No prose, no code fences.`,
          },
        ],
        schema: schemaJson,
        temperature: 0.1,
        timeoutMs: call.timeoutMs,
      });
      const second = tryParse(call.schema, repaired);
      if (second.ok) {
        recordSuccess(call.provider.name);
        return { data: second.data, model };
      }
      lastErr = new AIError('invalid_output', `Model output failed validation: ${second.error}`, model);
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('unknown', (e as Error).message, model);
      lastErr = err;
      if (!err.retryableWithOtherModel) break;
    }
  }
  recordFailure(call.provider.name, lastErr);
  throw lastErr;
}

function tryParse<T extends z.ZodType>(schema: T, raw: string): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = extractJson(raw);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const r = schema.safeParse(obj);
  if (r.success) return { ok: true, data: r.data };
  return {
    ok: false,
    error: r.error.issues
      .slice(0, 8)
      .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n'),
  };
}
