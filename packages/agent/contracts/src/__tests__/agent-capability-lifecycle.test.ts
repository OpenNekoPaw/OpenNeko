import { describe, expect, it } from 'vitest';
import {
  isAgentCapabilityInvocationInput,
  isAgentCapabilityInvocationResult,
  isAgentCapabilityLifecycleDescriptor,
  isRuntimeOnlyAgentCapabilityResourceValue,
  validateAgentCapabilityInvocationInput,
  validateAgentCapabilityInvocationResult,
  validateAgentCapabilityLifecycleDescriptor,
  type AgentCapabilityInvocationInput,
  type AgentCapabilityInvocationResult,
  type AgentCapabilityLifecycleDescriptor,
} from '../index';

describe('agent capability lifecycle contracts', () => {
  const contentLocator = createTestContentLocator();

  it('accepts valid lifecycle descriptors exposed through artifact facets', () => {
    const descriptor: AgentCapabilityLifecycleDescriptor = {
      capabilityId: 'canvas.ingestMarkdown',
      providerId: 'neko-canvas',
      displayName: 'Create storyboard review table',
      description: 'Create a review-first semantic storyboard table from Markdown.',
      phases: ['validate', 'review', 'apply'],
      inputSchema: { id: 'canvas.markdown.input' },
      resultSchema: { id: 'agent.capability.lifecycle.result' },
      accepts: ['markdown', 'gfm-table'],
      produces: ['canvas.table', 'canvas.storyboard'],
      risk: 'medium',
      requiresApproval: true,
      safetyKind: 'confirmation-gated',
      targetRequirements: {
        required: ['containerId'],
        allowedFallbacks: ['viewport-insertion'],
        confirmationModes: ['apply'],
      },
      queryBeforeMutate: {
        preferredQueryTools: ['canvas.listSelection'],
        reason: 'Resolve stable Canvas insertion target before applying.',
      },
    };

    expect(validateAgentCapabilityLifecycleDescriptor(descriptor)).toEqual([]);
    expect(isAgentCapabilityLifecycleDescriptor(descriptor)).toBe(true);
  });

  it('diagnoses invalid descriptor fields', () => {
    const diagnostics = validateAgentCapabilityLifecycleDescriptor({
      capabilityId: '',
      providerId: 'neko-canvas',
      displayName: 'Bad capability',
      description: 'Invalid descriptor',
      phases: ['review', 'publish'],
      inputSchema: {},
      resultSchema: { id: 'result' },
      accepts: ['markdown', ''],
      risk: 'critical',
      requiresApproval: 'yes',
      safetyKind: 'unsafe',
    });

    expect(diagnostics.map((diagnostic) => diagnostic.fieldKey)).toEqual([
      'capabilityId',
      'phases',
      'inputSchema',
      'accepts',
      'risk',
      'requiresApproval',
      'safetyKind',
    ]);
  });

  it('accepts invocation input with approval and provenance context', () => {
    const input: AgentCapabilityInvocationInput = {
      capabilityId: 'canvas.createStoryboardFromMarkdown',
      phase: 'apply',
      payload: {
        markdown: '| visual |\n| --- |\n| opening |',
      },
      target: {
        packageId: 'neko-canvas',
        containerId: 'scene-1',
        insertionPoint: { x: 10, y: 20 },
      },
      approval: {
        source: 'creation-apply',
        approvalId: 'approval-1',
        approvedAt: 123,
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        profileId: 'idc.default',
        stageId: 'apply',
      },
      provenance: {
        source: 'agent',
        conversationId: 'conversation-1',
        creationId: 'creation-1',
        iterationId: 'iteration-1',
      },
    };

    expect(validateAgentCapabilityInvocationInput(input)).toEqual([]);
    expect(isAgentCapabilityInvocationInput(input)).toBe(true);
  });

  it('accepts invocation result envelopes with executable actions and stable refs', () => {
    const result: AgentCapabilityInvocationResult = {
      capabilityId: 'canvas.ingestMarkdown',
      phase: 'review',
      status: 'needs-review',
      diagnostics: [
        {
          severity: 'warning',
          code: 'canvas-markdown-resource-missing',
          message: 'Resource token P3 is unresolved.',
          token: 'P3',
        },
      ],
      reviewArtifact: {
        kind: 'node',
        id: 'table-node-1',
        packageId: 'neko-canvas',
        artifactKind: 'canvas.table',
        profile: 'canvas.tableProfile.storyboard',
      },
      changedRefs: [
        {
          kind: 'content',
          contentLocator,
        },
      ],
      actions: [
        {
          actionId: 'create-storyboard-nodes',
          label: 'Create storyboard nodes',
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          requiresApproval: true,
          sourceRef: {
            kind: 'node',
            id: 'table-node-1',
            packageId: 'neko-canvas',
          },
        },
      ],
      data: {
        tableNodeId: 'table-node-1',
      },
    };

    expect(validateAgentCapabilityInvocationResult(result)).toEqual([]);
    expect(isAgentCapabilityInvocationResult(result)).toBe(true);
  });

  it('rejects runtime-only artifact references in lifecycle results', () => {
    const diagnostics = validateAgentCapabilityInvocationResult({
      capabilityId: 'canvas.createMarkdownNote',
      phase: 'review',
      status: 'needs-review',
      diagnostics: [],
      reviewArtifact: {
        kind: 'project-path',
        projectPath: 'neko-media://panel/preview.png',
      },
      changedRefs: [
        {
          kind: 'project-path',
          projectPath: '/tmp/neko/generated.png',
        },
      ],
    });

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'agent-capability-lifecycle-invalid-artifact-ref',
      'agent-capability-lifecycle-invalid-artifact-refs',
    ]);
  });

  it('classifies runtime-only resource identity values', () => {
    expect(isRuntimeOnlyAgentCapabilityResourceValue('neko-media://panel/image.png')).toBe(true);
    expect(isRuntimeOnlyAgentCapabilityResourceValue('blob:neko-media/preview')).toBe(true);
    expect(isRuntimeOnlyAgentCapabilityResourceValue('/tmp/neko/page.png')).toBe(true);
    expect(isRuntimeOnlyAgentCapabilityResourceValue('/var/folders/neko/page.png')).toBe(true);
    expect(isRuntimeOnlyAgentCapabilityResourceValue('/workspace/.runtime/page.png')).toBe(true);
    expect(isRuntimeOnlyAgentCapabilityResourceValue('assets/cover.png')).toBe(false);
    expect(isRuntimeOnlyAgentCapabilityResourceValue('${MEDIA}/cover.png')).toBe(false);
  });
});

function createTestContentLocator() {
  return {
    kind: 'workspace-file' as const,
    path: 'assets/cover.png',
    fingerprint: { strategy: 'provider' as const, value: 'cover-current' },
  };
}
