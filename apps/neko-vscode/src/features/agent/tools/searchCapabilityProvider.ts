import type { AgentCapabilityContext, AgentCapabilityProvider, Tool } from '@neko/shared';
import { createSemanticCoverageTool } from './semanticCoverageTool';

export function createSemanticCoverageCapabilityProvider(): AgentCapabilityProvider {
  return new SemanticCoverageCapabilityProvider();
}

class SemanticCoverageCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-search-semantic-coverage';
  readonly version = '1.0.0';

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [createSemanticCoverageTool()];
  }
}
