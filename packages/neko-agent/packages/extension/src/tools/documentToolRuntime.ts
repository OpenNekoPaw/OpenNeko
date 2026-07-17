import type { AgentCapabilityContext, ResourceRef } from '@neko/shared';

export interface DocumentToolRuntime {
  readonly resolveDocumentResourceScope: () => ResourceRef['scope'];
}

export function createDocumentToolRuntime(context: AgentCapabilityContext): DocumentToolRuntime {
  void context;
  return {
    resolveDocumentResourceScope,
  };
}

function resolveDocumentResourceScope(): ResourceRef['scope'] {
  return 'project';
}
