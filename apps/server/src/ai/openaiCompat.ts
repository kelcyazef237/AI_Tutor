import { AIError, classifyFetchError, classifyHttpError, type AIProvider, type ChatRequest } from './provider';

/** Any OpenAI-compatible /chat/completions endpoint (OpenAI, OpenRouter, vLLM, LM Studio, …). */
export class OpenAICompatProvider implements AIProvider {
  readonly name = 'openai';

  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  private headers() {
    return { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) };
  }

  async chat(req: ChatRequest): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.4,
          ...(req.schema ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
      });
    } catch (e) {
      throw classifyFetchError(e, req.model);
    }
    const text = await res.text();
    if (!res.ok) throw classifyHttpError(res.status, text, req.model);
    try {
      const body = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
      const content = body.choices?.[0]?.message?.content ?? '';
      if (!content.trim()) throw new AIError('invalid_output', 'Model returned an empty response.', req.model);
      return content;
    } catch (e) {
      if (e instanceof AIError) throw e;
      throw new AIError('invalid_output', 'Provider returned a non-JSON envelope.', req.model);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/models`, { headers: this.headers(), signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw classifyHttpError(res.status, await res.text());
      const body = (await res.json()) as { data?: { id: string }[] };
      return (body.data ?? []).map((m) => m.id).sort();
    } catch (e) {
      throw classifyFetchError(e);
    }
  }
}
