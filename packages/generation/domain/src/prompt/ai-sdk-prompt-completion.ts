import { resolveProvider } from '@neko/ai-sdk';
import { generateText } from 'ai';
import type { PromptCompletionPort } from './prompt-generation-service';

export function createAiSdkPromptCompletionPort(): PromptCompletionPort {
  return {
    async complete(input) {
      const apiKey = input.provider.apiKey?.trim();
      if (!apiKey) {
        throw new Error(`Prompt Generation provider '${input.provider.id}' has no credential.`);
      }
      const provider = resolveProvider(input.provider.type, {
        apiUrl: input.provider.apiUrl,
        apiKey,
      });
      const model = provider?.language(input.model.name);
      if (!model) {
        throw new Error(
          `Prompt Generation provider '${input.provider.id}' has no supported language adapter.`,
        );
      }
      const result = await generateText({
        model,
        prompt: input.prompt,
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      });
      return { text: result.text };
    },
  };
}
