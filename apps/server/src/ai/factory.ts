import type { Settings } from '@psc/shared';
import { MockProvider } from './mock';
import { OllamaProvider } from './ollama';
import { OpenAICompatProvider } from './openaiCompat';
import type { AIProvider } from './provider';

export function createProvider(s: Settings): AIProvider {
  switch (s.provider) {
    case 'openai':
      return new OpenAICompatProvider(s.openaiUrl, s.openaiKey);
    case 'mock':
      return new MockProvider();
    default:
      return new OllamaProvider(s.ollamaUrl);
  }
}
