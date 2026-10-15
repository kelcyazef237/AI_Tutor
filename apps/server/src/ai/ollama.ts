import { AIError, classifyFetchError, classifyHttpError, type AIProvider, type ChatRequest } from './provider';

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  /** Models that rejected the `format` parameter; we stop sending it to them. */
  private noFormat = new Set<string>();

  constructor(private baseUrl: string) {}

  async chat(req: ChatRequest): Promise<string> {
    const useFormat = req.schema && !this.noFormat.has(req.model);
    try {
      return await this.request(req, useFormat ? req.schema : undefined);
    } catch (e) {
      if (useFormat && e instanceof AIError && e.kind === 'unavailable' && /format|schema/i.test(e.message)) {
        this.noFormat.add(req.model);
        return this.request(req, undefined);
      }
      throw e;
    }
  }

  private async request(req: ChatRequest, format: object | undefined): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          stream: false,
          ...(format ? { format } : {}),
          options: { temperature: req.temperature ?? 0.4 },
        }),
        signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
      });
    } catch (e) {
      throw classifyFetchError(e, req.model);
    }
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(res.status, text, req.model);
    let body: { message?: { content?: string }; error?: string };
    try {
      body = JSON.parse(text);
    } catch {
      throw new AIError('invalid_output', 'Ollama returned a non-JSON envelope.', req.model);
    }
    if (body.error) throw classifyHttpError(500, JSON.stringify(body), req.model);
    const content = body.message?.content ?? '';
    if (!content.trim()) throw new AIError('invalid_output', 'Model returned an empty response.', req.model);
    return content;
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw classifyHttpError(res.status, await res.text());
      const body = (await res.json()) as { models?: { name: string }[] };
      return (body.models ?? []).map((m) => m.name).sort();
    } catch (e) {
      throw classifyFetchError(e);
    }
  }
}
