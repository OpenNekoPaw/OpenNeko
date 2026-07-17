import { describe, expect, it } from 'vitest';
import {
  CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
  CANVAS_WORKSPACE_BOARD_PATH,
  resolveCanvasWorkspaceBoardDocumentUri,
  validateCanvasWorkspaceProjectionRequest,
  validateCanvasWorkspaceProjectionResult,
  type CanvasWorkspaceProjectionRequest,
} from '../canvas-workspace-board';
import type { ResourceRef } from '../resource-cache';

const generatedRef: ResourceRef = {
  id: 'generated-output:shot-1',
  scope: 'project',
  provider: 'generated-output',
  kind: 'generated',
  source: {
    kind: 'generated-asset',
    generatedAssetId: 'shot-1',
    projectRelativePath: 'neko/generated/image/shot-1.png',
  },
  locator: { kind: 'generated-asset', assetId: 'shot-1' },
  fingerprint: { strategy: 'hash', value: 'sha256:shot-1' },
};

function request(
  overrides: Partial<CanvasWorkspaceProjectionRequest> = {},
): CanvasWorkspaceProjectionRequest {
  return {
    version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
    target: { workspaceUri: 'file:///workspace/project/' },
    provenance: {
      version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
      projectionId: 'projection:shot-1',
      artifactId: 'shot-1',
      revision: 'generated:sha256:shot-1',
      kind: 'image',
      sourceId: 'generated-output:shot-1',
      taskId: 'task-1',
      createdAt: '2026-07-15T00:00:00.000Z',
    },
    artifact: {
      kind: 'image',
      title: 'Shot 1',
      mimeType: 'image/png',
      resourceRef: generatedRef,
    },
    ...overrides,
  };
}

describe('Canvas Workspace Board projection contract', () => {
  it('derives one canonical Workspace Board URI', () => {
    expect(CANVAS_WORKSPACE_BOARD_PATH).toBe('neko/boards/workspace.nkc');
    expect(resolveCanvasWorkspaceBoardDocumentUri('file:///workspace/project/')).toBe(
      'file:///workspace/project/neko/boards/workspace.nkc',
    );
  });

  it('accepts canonical and explicit ordinary Canvas targets', () => {
    expect(validateCanvasWorkspaceProjectionRequest(request())).toEqual([]);
    expect(
      validateCanvasWorkspaceProjectionRequest(
        request({
          target: {
            workspaceUri: 'file:///workspace/project/',
            documentUri: 'file:///workspace/project/design/concept.nkc',
          },
        }),
      ),
    ).toEqual([]);
  });

  it('rejects missing workspace and invalid explicit Canvas targets', () => {
    const missingWorkspace = validateCanvasWorkspaceProjectionRequest(
      request({ target: { workspaceUri: '' } }),
    );
    const wrongExtension = validateCanvasWorkspaceProjectionRequest(
      request({
        target: {
          workspaceUri: 'file:///workspace/project/',
          documentUri: 'file:///workspace/project/edit.nkv',
        },
      }),
    );

    expect(missingWorkspace.map(({ code }) => code)).toContain('workspace-required');
    expect(wrongExtension.map(({ code }) => code)).toContain('invalid-canvas-extension');
  });

  it('rejects unknown projection kinds and mismatched artifact kinds', () => {
    const invalid = request({
      provenance: { ...request().provenance, kind: 'reasoning' as 'image' },
    });
    expect(validateCanvasWorkspaceProjectionRequest(invalid).map(({ code }) => code)).toContain(
      'unsupported-projection-kind',
    );
  });

  it('preserves stable replay identity without conversation routing state', () => {
    const input = request();
    expect(input.provenance.projectionId).toBe('projection:shot-1');
    expect(input.provenance.revision).toBe('generated:sha256:shot-1');
    expect(JSON.stringify(input)).not.toContain('conversationId');
    expect(JSON.stringify(input)).not.toContain('binding');
    expect(JSON.stringify(input)).not.toContain('scopeKind');
  });

  it('poisons active, recent, conversation, scope, runtime, and cache fields', () => {
    const invalid = {
      ...request(),
      conversationId: 'conversation-1',
      binding: { scopeKind: 'storyboard' },
      activeCanvas: 'file:///workspace/project/active.nkc',
      recentCanvas: 'file:///workspace/project/recent.nkc',
      renderUri: 'vscode-webview://preview/shot-1',
      cachePath: '.neko/.cache/generated/shot-1.png',
    } as unknown as CanvasWorkspaceProjectionRequest;
    const codes = validateCanvasWorkspaceProjectionRequest(invalid).map(({ code }) => code);

    expect(codes.filter((code) => code === 'legacy-routing-forbidden')).toHaveLength(4);
    expect(codes.filter((code) => code === 'runtime-value-forbidden')).toHaveLength(2);
  });

  it('rejects cache-backed or malformed resource identities', () => {
    const diagnostics = validateCanvasWorkspaceProjectionRequest(
      request({
        artifact: {
          kind: 'image',
          title: 'Unsafe',
          resourceRef: {
            ...generatedRef,
            source: {
              ...generatedRef.source,
              projectRelativePath: '.neko/.cache/generated/unsafe.png',
            },
          },
        },
      }),
    );
    expect(diagnostics.map(({ code }) => code)).toContain('invalid-resource-ref');
  });

  it('keeps blocked results target-free', () => {
    expect(
      validateCanvasWorkspaceProjectionResult({
        version: CANVAS_WORKSPACE_BOARD_CONTRACT_VERSION,
        status: 'blocked',
        target: {
          kind: 'workspace',
          documentUri: 'file:///workspace/project/neko/boards/workspace.nkc',
        },
        diagnostics: [],
      }).map(({ code }) => code),
    ).toContain('invalid-canvas-target');
  });
});
