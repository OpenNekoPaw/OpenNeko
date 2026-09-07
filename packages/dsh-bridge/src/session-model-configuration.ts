import type { ModelSelectionRef } from '@deepseek-ai/dsh-agent';

export interface DshSessionConfiguration {
  readonly provider?: string;
  readonly model?: string;
  readonly maxTokens?: number;
}

export class SessionModelConfigurationOwner {
  readonly modelSelection: ModelSelectionRef;
  private activeConfiguration: DshSessionConfiguration;
  private assembledMaxTokens: number | undefined;

  constructor(initialConfiguration: DshSessionConfiguration) {
    this.activeConfiguration = freezeConfiguration(initialConfiguration);
    this.modelSelection = {
      current: projectModelSelection(this.activeConfiguration),
      assembled: undefined,
    };
  }

  active(): DshSessionConfiguration {
    return this.activeConfiguration;
  }

  apply(configuration: DshSessionConfiguration): void {
    const next = freezeConfiguration(configuration);
    if (sameConfiguration(this.activeConfiguration, next)) return;
    this.activeConfiguration = next;
    this.modelSelection.current = projectModelSelection(next);
  }

  captureMaxTokens(): void {
    this.assembledMaxTokens = this.activeConfiguration.maxTokens;
  }

  maxTokensForAssembledRequest(): number | undefined {
    return this.assembledMaxTokens;
  }
}

function freezeConfiguration(configuration: DshSessionConfiguration): DshSessionConfiguration {
  return Object.freeze({
    ...(configuration.provider === undefined ? {} : { provider: configuration.provider }),
    ...(configuration.model === undefined ? {} : { model: configuration.model }),
    ...(configuration.maxTokens === undefined ? {} : { maxTokens: configuration.maxTokens }),
  });
}

function projectModelSelection(
  configuration: DshSessionConfiguration,
): ModelSelectionRef['current'] {
  if (configuration.provider === undefined || configuration.model === undefined) return undefined;
  return { provider: configuration.provider, model: configuration.model };
}

function sameConfiguration(left: DshSessionConfiguration, right: DshSessionConfiguration): boolean {
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    left.maxTokens === right.maxTokens
  );
}
