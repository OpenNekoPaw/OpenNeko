import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as acp from '../acp/index';
import * as runtime from '../index';
import * as runtimeSubpath from '../runtime/index';

const PACKAGE_ROOT = join(__dirname, '..', '..');

/**
 * Public-surface convergence guard for the agent-runtime package.
 *
 * The pre-Pi provider routing, approval, permission, validation, perception, external
 * processor/research, profile registry, and legacy conversation-control subsystems were
 * removed. This test pins the root entry, the `./runtime` subpath, and the package subpath
 * manifest so dead modules cannot be silently re-exported or re-added.
 */
describe('agent-runtime public surface convergence', () => {
  it('removes the deleted pre-Pi provider routing and profile subsystems from the root entry', () => {
    expect(runtime).not.toHaveProperty('ProviderRouter');
    expect(runtime).not.toHaveProperty('createProviderRouter');
    expect(runtime).not.toHaveProperty('createProviderCardRegistry');
    expect(runtime).not.toHaveProperty('ProviderCardRegistry');
    expect(runtime).not.toHaveProperty('parseProviderCardMarkdown');
    expect(runtime).not.toHaveProperty('registerRuntimeProviderCardDirectories');
    expect(runtime).not.toHaveProperty('createProviderExpressionPromptFragments');
    expect(runtime).not.toHaveProperty('AgentProfileRegistry');
    expect(runtime).not.toHaveProperty('ArtifactProfileRegistry');
    expect(runtime).not.toHaveProperty('ProviderExpressionProfileRegistry');
  });

  it('removes the deleted approval, permission, validation, and perception pipelines from the root entry', () => {
    expect(runtime).not.toHaveProperty('createApprovalEngine');
    expect(runtime).not.toHaveProperty('PermissionRuleMatcher');
    expect(runtime).not.toHaveProperty('createPermissionRuleMatcher');
    expect(runtime).not.toHaveProperty('ToolTraitsRegistry');
    expect(runtime).not.toHaveProperty('DEFAULT_PERMISSION_CONFIG');
    expect(runtime).not.toHaveProperty('createOutputValidator');
    expect(runtime).not.toHaveProperty('ImageValidator');
    expect(runtime).not.toHaveProperty('MermaidValidator');
    expect(runtime).not.toHaveProperty('DEFAULT_IMAGE_CONSTRAINTS');
    expect(runtime).not.toHaveProperty('createPerceptionPipeline');
    expect(runtime).not.toHaveProperty('PerceptionPipeline');
  });

  it('removes the deleted external processor/research and legacy conversation controls from the root entry', () => {
    expect(runtime).not.toHaveProperty('createAgentExternalProcessorRuntime');
    expect(runtime).not.toHaveProperty('resolveExternalResearchCapability');
    expect(runtime).not.toHaveProperty('createFakeExternalResearchProvider');
    expect(runtime).not.toHaveProperty('createCapabilityRuntimeBindingStore');
    expect(runtime).not.toHaveProperty('createAgentCapabilityRuntimeRegistries');
    expect(runtime).not.toHaveProperty('runNewConversationRuntime');
    expect(runtime).not.toHaveProperty('runSwitchConversationRuntime');
    expect(runtime).not.toHaveProperty('runDeleteConversationRuntime');
    expect(runtime).not.toHaveProperty('buildConversationHistoryClearedMessage');
    expect(runtime).not.toHaveProperty('ToolCategoryRegistry');
    expect(runtime).not.toHaveProperty('createToolCategoryRegistry');
    expect(runtime).not.toHaveProperty('resolveToolGroupTier');
    expect(runtime).not.toHaveProperty('perceptionToolGroup');
    expect(runtime).not.toHaveProperty('DEFAULT_INJECTION_CONFIG');
    expect(runtime).not.toHaveProperty('CORE_TOOLS');
  });

  it('keeps retired MCP and Tool runtime exports absent from the canonical root', () => {
    expect(runtime).not.toHaveProperty('createMCPClient');
    expect(runtime).not.toHaveProperty('ToolRegistry');
    expect(runtime).not.toHaveProperty('createToolRegistry');
    expect(runtime).not.toHaveProperty('createCoreTools');
    expect(runtime).toHaveProperty('composeProviderImageBatches');
    expect(runtime).not.toHaveProperty('projectMultimodalPacketToChatMessage');
    expect(runtime).not.toHaveProperty('projectPerceptionCardToContentParts');
    expect(runtime).toHaveProperty('createConversationId');
    expect(runtime).toHaveProperty('createInputProcessor');
  });

  it('removes the deleted subsystems from the ./runtime subpath', () => {
    expect(runtimeSubpath).not.toHaveProperty('createPerceptionPipeline');
    expect(runtimeSubpath).not.toHaveProperty('PerceptionPipeline');
    expect(runtimeSubpath).not.toHaveProperty('createAgentExternalProcessorRuntime');
    expect(runtimeSubpath).not.toHaveProperty('createDeveloperModeTemporaryProcessorRequest');
    expect(runtimeSubpath).not.toHaveProperty('resolveExternalResearchCapability');
    expect(runtimeSubpath).not.toHaveProperty('createExternalResearchCapabilityProvider');
    expect(runtimeSubpath).not.toHaveProperty('createFakeExternalResearchProvider');
    expect(runtimeSubpath).not.toHaveProperty('createMcpExternalResearchProvider');
    expect(runtimeSubpath).not.toHaveProperty('createCapabilityRuntimeBindingStore');
    expect(runtimeSubpath).not.toHaveProperty('createAgentCapabilityRuntimeRegistries');
    expect(runtimeSubpath).not.toHaveProperty('CapabilityRegistryRuntime');
    expect(runtimeSubpath).not.toHaveProperty('createConversationProjectionStore');
    expect(runtimeSubpath).not.toHaveProperty('createConversationRunRegistry');
    expect(runtimeSubpath).not.toHaveProperty('createExecutionOwnershipRegistry');
    expect(runtimeSubpath).not.toHaveProperty('deliverCreatorVisibleArtifactsFromTurnProjection');
    expect(runtimeSubpath).not.toHaveProperty('buildTurnMultimodalContextPacket');
    expect(runtimeSubpath).not.toHaveProperty('projectMessageForResourceDisplay');
    expect(runtimeSubpath).not.toHaveProperty('buildActiveConversationMessage');
  });

  it('exposes the package-owned ACP application client through one subpath', () => {
    expect(acp).toHaveProperty('DshAcpApplicationClient');
  });

  it('removes the deleted package subpath files and exports', () => {
    const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      exports?: Record<string, string>;
    };
    expect(manifest.exports ?? {}).not.toHaveProperty('./approval');
    expect(manifest.exports ?? {}).not.toHaveProperty('./validation');
    expect(manifest.exports).toHaveProperty('./acp', './src/acp/index.ts');

    for (const deleted of [
      'src/approval/index.ts',
      'src/validation/index.ts',
      'src/permission/index.ts',
      'src/perception/index.ts',
      'src/profile/index.ts',
      'src/provider/index.ts',
      'src/tools/tool-category-registry.ts',
      'src/tools/tier-resolver.ts',
      'src/tools/perception/perception-tool-group.ts',
      'src/tools/tool-registry.ts',
      'src/mcp/index.ts',
      'src/runtime/projection/conversation-projection-store.ts',
      'src/runtime/session/conversation-run-registry.ts',
      'src/runtime/session/execution-ownership.ts',
      'src/runtime/turn/creator-visible-artifact-collector.ts',
      'src/provider/multimodal-message-projection.ts',
      'src/runtime/turn/multimodal-context-packet.ts',
      'src/input/message-resource-projector.ts',
      'src/session/conversation-host-message.ts',
    ]) {
      expect(existsSync(join(PACKAGE_ROOT, deleted)), `${deleted} should not exist`).toBe(false);
    }
  });
});
