/**
 * Protocol source contract tests for neko-canvas extension.
 *
 * Verifies that canvasEditorProvider.ts uses the correct DTO field names
 * in cross-boundary messages. If someone changes a field name, this test fails.
 *
 * Tested contracts (post-fix):
 *   NKV-001: nodes.list uses nodeType (not bare "type")
 *   NKV-001B: nodes.update uses data field
 *   NKV-001C: nodes.create uses payload { type, position, data }
 *   NKV-002: scriptIndexResult uses scenes (not "index")
 *   NKV-003: modelInstalledResult uses installedVersion (not "installed")
 *   NKV-004: webview consumes the same nodes.update / nodes.create DTO
 *   NKV-005: operation bridge uses shared VSCode gateway
 *   NKV-006: timeline import success round-trips through timelineSync
 *   NKV-007: toolbar can pick .nkc files into canvas-embed nodes
 *   NKV-008: toolbar pickers cover file-bound reference nodes
 *   NKV-009: composable Agent node operations use payload wrappers
 *   NKV-010: projected Canvas write-back routes through projection adapters
 *   NKV-012: canvas toolbar export intent routes through a whitelisted command
 *   NKV-013: resource cache providers own thumbnail/preview/generated materialization
 *   NKV-014: intent-aware content access owns Canvas resource preview projection
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

interface CanvasManifest {
  readonly contributes: {
    readonly configuration: {
      readonly properties: Record<string, unknown>;
    };
  };
}

// Read the production source file for contract verification
const providerSource = readFileSync(join(__dirname, '../editor/canvasEditorProvider.ts'), 'utf-8');
const webviewSource = readFileSync(
  join(__dirname, '../../../webview/src/hooks/useVSCodeMessages.ts'),
  'utf-8',
);
const canvasAppSource = readFileSync(
  join(__dirname, '../../../webview/src/CanvasApp.tsx'),
  'utf-8',
);
const containerRendererSource = readFileSync(
  join(__dirname, '../../../webview/src/components/content/ContainerRenderer.tsx'),
  'utf-8',
);
const playbackWorkspaceSource = readFileSync(
  join(__dirname, '../../../webview/src/components/playback/PlaybackWorkspace.tsx'),
  'utf-8',
);
const routeStoryboardMatrixSource = readFileSync(
  join(__dirname, '../../../webview/src/components/playback/routeStoryboardMatrix.ts'),
  'utf-8',
);
const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const narrativePreviewBridgeSource = readFileSync(
  join(__dirname, '../editor/narrativePreviewBridge.ts'),
  'utf-8',
);
const narrativePreviewMediaRuntimeSource = readFileSync(
  join(__dirname, '../../../webview/src/preview/narrativePreviewMediaRuntime.ts'),
  'utf-8',
);
const operationStoreSource = readFileSync(
  join(__dirname, '../../../webview/src/stores/canvasOperationStore.ts'),
  'utf-8',
);
const canvasManifest = JSON.parse(
  readFileSync(join(__dirname, '../../../../package.json'), 'utf-8'),
) as CanvasManifest;

function readMethodBody(source: string, methodStart: string): string {
  const start = source.indexOf(methodStart);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextMethod = source.indexOf('\n  private ', start + methodStart.length);
  const nextPublicMethod = source.indexOf('\n  async ', start + methodStart.length);
  const candidates = [nextMethod, nextPublicMethod].filter((index) => index > start);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

describe('canvasEditorProvider message contracts', () => {
  describe('NKV-001: nodes.list nodeType parameter', () => {
    it('sends nodeType field, not bare type', () => {
      // After NKV-001 fix: the provider must send nodeType: type
      expect(providerSource).toContain('nodeType: type');
    });
  });

  describe('NKV-001B: nodes.update data parameter', () => {
    it('sends data field from extension', () => {
      expect(providerSource).toContain("sendRequest('nodes.update', { nodeId, data })");
    });

    it('consumes data field in webview', () => {
      expect(webviewSource).toContain('message.data as Record<string, unknown>');
    });
  });

  describe('NKV-001C: nodes.create payload contract', () => {
    it('sends payload wrapper from extension', () => {
      expect(providerSource).toContain('payload: { type, position, data, preset }');
    });

    it('consumes payload wrapper in webview', () => {
      expect(webviewSource).toContain('const payload = (message.payload as');
      expect(webviewSource).toContain("const type = payload.type ?? 'annotation'");
      expect(webviewSource).toContain('type,');
      expect(webviewSource).toContain('position: payload.position ??');
      expect(webviewSource).toContain('data: payload.data ?? {}');
      expect(webviewSource).toContain('preset: payload.preset');
    });
  });

  describe('NKV-002: scriptIndexResult scenes field', () => {
    it('maps script index scenes into canvas ScriptScene payloads', () => {
      expect(providerSource).toContain('scenes: mapStoryScriptIndexToCanvasScenes(index),');
    });

    it('sends scenes: null on error', () => {
      expect(providerSource).toContain('scenes: null,');
    });

    it('resolves and reads the contracted script path through the retained content parser', () => {
      expect(providerSource).toContain(
        'const resolvedScriptPath = await this.resolveAssetPath(scriptPath, document.uri);',
      );
      expect(providerSource).toContain(
        'vscode.workspace.fs.readFile(vscode.Uri.file(resolvedScriptPath))',
      );
      expect(providerSource).toContain(
        'buildFountainScriptIndex({ uri: resolvedScriptPath, content })',
      );
    });

    it('does not use bare index as field name in scriptIndexResult', () => {
      // Ensure no regression: the response object should not have { index: index }
      const lines = providerSource.split('\n');
      const scriptIndexLines = lines.filter(
        (l) => l.includes('scriptIndexResult') || l.includes('index: index'),
      );
      const hasOldPattern = scriptIndexLines.some((l) => /\bindex: index\b/.test(l));
      expect(hasOldPattern).toBe(false);
    });
  });

  describe('NKV-005: operation bridge gateway', () => {
    it('uses shared VSCode gateway helper', () => {
      expect(operationStoreSource).toContain(
        "import { getGlobalVSCodeApi } from '../utils/vscode';",
      );
      expect(operationStoreSource).toContain('const vscode = getGlobalVSCodeApi();');
    });

    it('does not directly read window.__vscode_api__', () => {
      expect(operationStoreSource).not.toContain('__vscode_api__');
    });
  });

  describe('NKV-006: timeline import round-trip', () => {
    it('extension sends shared timelineSync payload with minimal backflow fields', () => {
      expect(providerSource).toContain("type: 'timelineSync'");
      expect(providerSource).toContain('buildStoryboardImportTimelineSyncPayload(');
      expect(providerSource).toContain('payload,');
    });

    it('webview consumes timelineSync payload', () => {
      expect(webviewSource).toContain("case 'timelineSync'");
      expect(webviewSource).toContain(
        'onTimelineSyncRef.current?.(message.payload as CanvasTimelineSyncPayload)',
      );
    });
  });

  describe('NKV-007: canvas embed picker', () => {
    it('routes Canvas file picking through project:addSource only', () => {
      expect(providerSource).toContain("case 'project:addSource'");
      expect(providerSource).toContain('private async resolveCanvasProjectSourceAddRequest(');
      expect(providerSource).toContain('private createCanvasProjectSourcePickerFilters(');
      expect(providerSource).toContain('this.createCanvasPickerSourceAddRequest(uri, documentUri');
      expect(providerSource).not.toContain("case 'pickCanvasDocument'");
      expect(providerSource).not.toContain('rejectLegacyCanvasPickerMessage');
      expect(providerSource).not.toContain('createCanvasDroppedAssetFromProjectAddSource');
      expect(providerSource).not.toContain("postMessage({ type: 'dropAssets'");
    });
  });

  describe('NKV-008: reference picker entrypoints', () => {
    it('removes legacy script/document/model picker message entrypoints', () => {
      expect(providerSource).not.toContain("case 'pickMediaFile'");
      expect(providerSource).not.toContain("case 'pickScriptDocument'");
      expect(providerSource).not.toContain("case 'pickReferenceDocument'");
      expect(providerSource).not.toContain("case 'pickModelReference'");
      expect(providerSource).not.toContain("case 'pickProjectDocument'");
      expect(providerSource).not.toContain('rejectLegacyCanvasPickerMessage');
      expect(providerSource).toContain('private createCanvasProjectSourcePickerFilters(');
      expect(providerSource).not.toContain("postMessage({ type: 'dropAssets'");
    });
  });

  describe('NKV-009: Agent composite operation contracts', () => {
    it('waits for canvas data readiness before Agent composite operations', () => {
      expect(providerSource).toContain("case 'canvasDataReady'");
      expect(providerSource).toContain('canvasDataReadyDocumentUris.add(documentUri)');
      expect(providerSource).toContain('hasActiveCanvasEditorReady()');
      expect(webviewSource).toContain("vscode.postMessage({ type: 'canvasDataReady' })");
    });

    it('extension sends new node operation payload wrappers', () => {
      expect(providerSource).toContain("sendRequest<CanvasDeriveNodeResult>('nodes.derive'");
      expect(providerSource).toContain('sendRequest<CanvasCreateConnectionResult>');
      expect(providerSource).toContain("'nodes.createConnection'");
      expect(providerSource).toContain(
        "sendRequest<CanvasCreateCompositeResult>('nodes.createComposite'",
      );
      expect(providerSource).toContain("sendRequest<CanvasUpdateBlockResult>('nodes.updateBlock'");
      expect(providerSource).toContain('sendRequest<CanvasExtractStructuredContentResult>');
      expect(providerSource).toContain("'nodes.extractStructuredContent'");
      expect(providerSource).toContain('payload: request');
    });

    it('webview consumes new node operation requests', () => {
      expect(webviewSource).toContain("case 'nodes.derive'");
      expect(webviewSource).toContain("case 'nodes.createConnection'");
      expect(webviewSource).toContain("case 'nodes.createComposite'");
      expect(webviewSource).toContain("case 'nodes.updateBlock'");
      expect(webviewSource).toContain("case 'nodes.extractStructuredContent'");
      expect(webviewSource).toContain("withOperationSource('ai'");
    });

    it('sendRequest rejects typed errors returned by the webview', () => {
      expect(providerSource).toContain("typeof (value as { error?: unknown }).error === 'string'");
      expect(providerSource).toContain('reject(new Error((value as { error: string }).error));');
    });

    it('validates registered node types before cross-boundary Agent operations', () => {
      expect(providerSource).toContain('assertCanvasNodeType(type)');
      expect(providerSource).toContain('assertCanvasNodeType(request.targetType)');
      expect(providerSource).toContain('assertCanvasNodeType(request.containerType)');
      expect(providerSource).toContain('assertCanvasNodeType(child.type)');
      expect(webviewSource).toContain('isCanvasNodeType(typeFilter)');
      expect(webviewSource).toContain('isCanvasNodeType(type)');
    });
  });

  describe('NKV-013: unified resource cache provider integration', () => {
    it('registers provider adapters instead of guessing package cache roots', () => {
      expect(providerSource).toContain('new ThumbnailResourceCacheProvider');
      expect(providerSource).toContain('new PreviewVariantResourceCacheProvider');
      expect(providerSource).toContain('new GeneratedAssetDerivativeResourceCacheProvider');
      expect(providerSource).toContain('new DocumentResourceCacheProvider');
      expect(providerSource).not.toContain('new LegacyResourceCacheProvider');
    });

    it('preview variant resolution uses ResourceRef without cache-path compatibility', () => {
      expect(providerSource).toContain('const resourceRef = isResourceRef(message.resourceRef)');
      expect(providerSource).toContain('this.projectResourceCacheVariant(');
      expect(providerSource).toContain("case 'preview:resolveVariant'");
      expect(providerSource).toContain(
        'resolveCanvasPreviewVariantRole(resourceRef, preferredRole)',
      );
    });

    it('open media preview resolves ResourceRef through content access before local paths', () => {
      expect(providerSource).toContain("case 'openMediaPreview'");
      expect(providerSource).toContain('this.resolveResourceRefLocalPreviewPath(');
      expect(providerSource).toContain("'neko-canvas.open-media-preview'");
      expect(providerSource).toContain("target: 'local-path'");
    });

    it('AssetLibrary actions reuse the authorized local-path resolver', () => {
      const actions = providerSource.slice(
        providerSource.indexOf("case 'openMediaPreview':"),
        providerSource.indexOf("case 'preview:resolveVariant':"),
      );
      const resolver = providerSource.slice(
        providerSource.indexOf('private async resolveCanvasMaterialLocalFilePath('),
        providerSource.indexOf('private resolvePreviewResourceRef('),
      );

      expect(actions).toContain("case 'saveCanvasMaterialToAssetLibrary':");
      expect(actions).toContain("'neko.assets.importFile'");
      expect(actions).toContain('this.resolveCanvasMaterialLocalFilePath(');
      expect(actions).not.toContain('vscode.workspace.fs.readFile');
      expect(resolver).toContain('this.resolvePreviewResourceRef(');
      expect(resolver).toContain('this.resolveResourceRefLocalPreviewPath(');
      expect(resolver).toContain('this.resolveCanvasMediaLocalFilePath(');
      expect(resolver).not.toContain('this.resolveAssetPath(');
    });

    it('media playback actions resolve ResourceRef through content access', () => {
      expect(providerSource).toContain("case 'media:probe'");
      expect(providerSource).toContain("'neko-canvas.media-probe'");
      expect(providerSource).toContain("case 'media:play'");
      expect(providerSource).toContain("'neko-canvas.media-play'");
      expect(providerSource).toContain("case 'media:captureFrame'");
      expect(providerSource).toContain("'neko-canvas.media-capture-frame'");
    });
  });

  describe('NKV-014: intent-aware content access boundaries', () => {
    it('routes resource preview projection through ContentAccessService', () => {
      expect(providerSource).toContain('createHostContentAccessRuntime');
      expect(providerSource).toContain('this.createCanvasResourceCacheProviders(workspaceRoot)');
      expect(providerSource).toContain("intent: 'interactive-preview'");
      expect(providerSource).toContain("target: 'webview-uri'");
      expect(providerSource).toContain("materialization: 'if-missing'");
    });

    it('routes asset path variables through shared host content policy instead of neko-assets commands', () => {
      expect(providerSource).toContain('resolveHostContentMediaPath');
      expect(providerSource).toContain('contractHostContentMediaPath');
      expect(providerSource).not.toContain("'neko.assets.resolvePath'");
      expect(providerSource).not.toContain("'neko.assets.contractPath'");
    });

    it('binds Webview URI projection to the requesting Webview instead of the active editor', () => {
      expect(providerSource).toContain('CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY');
      expect(providerSource).toContain('private readonly contentAccessWebviewsByToken');
      expect(providerSource).toContain('resolveContentAccessWebview(request');
      expect(providerSource).toContain('this.contentAccessWebviewsByToken.get(token)');
      expect(providerSource).toContain('withContentAccessWebview(webview');
      expect(providerSource).toContain(
        'metadata: { [CONTENT_ACCESS_WEBVIEW_RESOLVER_TOKEN_METADATA_KEY]: webviewResolverToken }',
      );
      expect(providerSource).not.toContain(
        'webviewResolver: () => this.activeWebviewPanel?.webview',
      );
    });

    it('projects Canvas playback plans for the Preview panel without persisting runtime URLs', () => {
      expect(providerSource).toContain('extractCanvasPlaybackPlanForPreview(');
      expect(providerSource).toContain('prepareCanvasDataForPlaybackPreview(');
      expect(providerSource).toContain('cloneCanvasDataForPlaybackPreview(');
      expect(providerSource).toContain(
        'const plan = createCanvasPlaybackPlanFromCanvasData(previewCanvasData, {',
      );
      expect(providerSource).toContain(
        'selectedNodeId: this.readCanvasPlaybackSelectedNodeId(canvasData)',
      );
      expect(providerSource).toContain('previewCanvasData,');
      expect(providerSource).toContain('enrichCanvasPlaybackPlanForPreview(');
      expect(providerSource).toContain('resolveCanvasPlaybackUnitPreviewSource(');
      expect(providerSource).toContain('resolveShotPlaybackPreviewSource(');
      expect(providerSource).toContain('resolveMediaPlaybackPreviewSource(');
      expect(providerSource).toContain('previewUrl: previewSource.url');
      expect(providerSource).toContain('previewSourceKind: previewSource.kind');
      expect(providerSource).toContain('previewPlayableAssetPath: previewSource.playableAssetPath');
      expect(providerSource).toContain('previewSourceAssetPath: previewSource.source.source');
      expect(providerSource).toContain(
        'previewSourceResourceRef: previewSource.source.resourceRef',
      );
      expect(providerSource).toContain(
        'previewSourceDocumentResourceRef: previewSource.source.documentResourceRef',
      );
      expect(narrativePreviewBridgeSource).toContain('extractCanvasPlaybackPlanForPreview?(');
      expect(narrativePreviewBridgeSource).toContain('postPreviewSpecificPlaybackPlan(');
      expect(narrativePreviewBridgeSource).toContain('postCanvasPlaybackPlanToPreview(');
      expect(narrativePreviewBridgeSource).toContain('postPreviewPlaybackPlan(');
    });

    it('uses storyboard media refs as shot Preview image fallbacks', () => {
      expect(providerSource).toContain('resolveShotMediaRefsPlaybackPreviewSource(');
      expect(providerSource).toContain("data['generatedMediaRefs']");
      expect(providerSource).toContain("data['shotImagePrepPlan']");
      expect(providerSource).toContain("['outputMediaRefs']");
      expect(providerSource).toContain("data['sourceMediaRefs']");
      expect(providerSource).toContain("data['mediaRefs']");
      expect(providerSource).toContain("'neko-canvas.preview-playback-shot-media-ref'");
      expect(providerSource).toContain('readStoryboardMediaRefPreviewSource(');
      expect(providerSource).toContain('this.readPreviewSourceCandidate(ref)');
      expect(providerSource).toContain("this.readNestedRecord(ref['locator'])");
      expect(providerSource).toContain("record['resourceRef']");
      expect(providerSource).toContain("record['assetRef']");
      expect(providerSource).toContain("record['metadata']");
      expect(providerSource).toContain('this.readPreviewResourceRef(nestedAssetRef)');
      expect(providerSource).toContain('this.readPreviewDocumentResourceRef(nestedMetadata)');
      expect(providerSource).not.toContain("record['cacheResourceRef']");
      expect(providerSource).toContain("'previewUrl'");
      expect(providerSource).toContain("'dataUrl'");
      expect(providerSource).toContain("'webviewUri'");
      expect(providerSource).toContain("'url'");
      expect(providerSource).toContain("'src'");
      expect(providerSource).toContain("'sourcePath'");
      expect(providerSource).toContain("'localPath'");
      expect(providerSource).toContain("'path'");
      expect(providerSource).toContain("'assetPath'");
      expect(providerSource).toContain("'uri'");
      expect(providerSource).toContain("'filePath'");
    });

    it('labels Preview visual sources without merging generated and reference semantics', () => {
      expect(providerSource).toContain("kind: 'generated-image'");
      expect(providerSource).toContain("'generated-media'");
      expect(providerSource).toContain("kind: 'reference-image'");
      expect(providerSource).toContain("'source-media'");
      expect(narrativePreviewBridgeSource).toContain('formatPreviewSourceKind(');
      expect(narrativePreviewBridgeSource).toContain('summarizeStoryboardMediaRefs(');
      expect(narrativePreviewBridgeSource).toContain('previewSourceGeneratedImage');
      expect(narrativePreviewBridgeSource).toContain('previewSourceReferenceImage');
      expect(narrativePreviewBridgeSource).toContain('previewSourceSourceMedia');
    });

    it('keeps shot Preview source priority aligned with Canvas node cards', () => {
      expect(providerSource).toContain('readSelectedGenerationCandidatePreviewSource(');
      expect(providerSource).toContain("data['generationHistory']");
      expect(providerSource).toContain("'neko-canvas.preview-playback-selected-generation'");
      expect(providerSource).toContain("data['runtimeReferenceImagePath']");
      expect(providerSource).toContain("'neko-canvas.preview-playback-runtime-reference'");
      expect(providerSource).toContain('resolveCanvasPlaybackPreviewSourceCandidate(');
      expect(providerSource).toContain('resolveMediaPlaybackFilePath(');
      expect(providerSource).toContain('resolveCanvasMediaLocalFilePath(');
      expect(providerSource).toContain('resolveCanvasPlaybackLocalPreviewPathCandidates(');
      expect(providerSource).toContain('createVSCodeWorkspaceMediaPathContext');
      expect(providerSource).toContain('createCanvasWorkspaceMediaPathContext(');
      expect(providerSource).toContain('createWorkspaceMediaPathCandidates(');
      expect(providerSource).toContain('resolveWorkspaceMediaPath({');
      expect(providerSource).toContain('readRootRelativeCanvasAssetPath(');
      expect(providerSource).toContain('readWorkspaceRelativeCanvasAssetPath(');
      expect(providerSource).toContain('normalizeWorkspaceRelativeCanvasAssetPath(');
      expect(providerSource).toContain('readSlashPrefixedDocumentRelativeCanvasAssetPath(');
      expect(providerSource).toContain('resolveRootRelativeCanvasAssetPathCandidates(');
      expect(providerSource).toContain('resolveDocumentRelativeCanvasAssetPathCandidates(');
      expect(providerSource).toContain("trimmed.startsWith('../')");
      expect(providerSource).toContain('projectCanvasMediaLocalFile(');
      expect(providerSource).toContain('getCanvasLocalResourceRoots(');
      expect(providerSource).toContain(
        'extraRoots: this.getCanvasLocalResourceRoots(document.uri)',
      );
      expect(providerSource).toContain('vscode.workspace.getWorkspaceFolder(documentUri)?.uri');
      expect(providerSource).toContain(
        'for (const folder of vscode.workspace.workspaceFolders ?? [])',
      );
      expect(providerSource).toContain('appendExistingCanvasPlaybackPreviewPathCandidate(');
      expect(providerSource).toContain('readFirstPreviewSourceString(');
      expect(providerSource).toContain('...(webview.options.localResourceRoots ?? [])');
      expect(providerSource).toContain('!/vscode-resource\\.vscode-cdn\\.net/i.test(value)');
      expect(providerSource).toContain('resolveVSCodeResourceUriPath(');
      expect(providerSource).toContain('new URL(source)');
      expect(providerSource).toContain('return decodeURIComponent(url.pathname);');
      expect(providerSource).toContain('/vscode-resource\\.vscode-cdn\\.net(\\/[^?#]*)/i');
    });

    it('registers document resources so stable document refs can be materialized in Canvas', () => {
      expect(providerSource).toContain('DocumentResourceCacheProvider');
      expect(providerSource).toContain('createCanvasDocumentEntryReader()');
      expect(providerSource).not.toContain('findUniqueEntryByBasename');
      expect(providerSource).toContain("preferredRole === 'source'");
      expect(providerSource).toContain("? 'page-image'");
      expect(providerSource).toContain(": 'document-entry'");
    });

    it('does not persist referenceImagePath when a shot has stable resource refs', () => {
      expect(providerSource).toContain("delete nodeData['runtimeReferenceImagePath'];");
      expect(providerSource).toContain("isResourceRef(nodeData['referenceResourceRef'])");
      expect(providerSource).toContain(
        "isDocumentArchiveResourceRef(nodeData['referenceImageResourceRef'])",
      );
      expect(providerSource).toContain("delete nodeData['referenceImagePath'];");
    });

    it('does not read removed document cache metadata for runtime Preview fallbacks', () => {
      expect(providerSource).not.toContain('markDocumentResourceMigrationFallback');
      expect(providerSource).not.toContain("reason: 'legacy-cache-fallback'");
      expect(providerSource).not.toContain('Using a legacy document cache path');
      expect(providerSource).not.toContain('resolveExistingDocumentResourceRoot');
      expect(providerSource).not.toContain('documentResourceCacheRoots');
      expect(providerSource).not.toContain('legacyCachePath');
      expect(providerSource).toContain('projectDocumentResourcePreviewUrl(');
      expect(providerSource).toContain("delete nodeData['runtimeReferenceImagePath'];");
      expect(providerSource).toContain("nodeData['documentResourceStatus'] = {");
    });

    it('clears stale runtime previews when document reference materialization fails', () => {
      expect(providerSource).toContain("delete nodeData['runtimeAssetPath'];");
      expect(providerSource).toContain("delete nodeData['runtimeThumbnailPath'];");
      expect(providerSource).toContain("delete nodeData['runtimeReferenceImagePath'];");
      expect(providerSource).toContain(
        "this.markDocumentResourceUnavailable(nodeData, 'cache-missing')",
      );
    });

    it('resolves generated asset resource refs with workspace path variables', () => {
      expect(providerSource).toContain('new GeneratedAssetDerivativeResourceCacheProvider({');
      expect(providerSource).toContain('pathResolver: createWorkspacePathResolver(workspaceRoot)');
      expect(providerSource).toContain("['WORKSPACE', workspaceRoot]");
      expect(providerSource).toContain("['PROJECT', workspaceRoot]");
    });
  });

  describe('NKV-015: Canvas narrative preview bridge', () => {
    it('extracts NarrativeGraphSnapshot from the in-memory Canvas provider state', () => {
      expect(providerSource).toContain('private readonly canvasSnapshotsByDocumentUri');
      expect(providerSource).toContain('private readonly canvasRevisionsByDocumentUri');
      expect(providerSource).toContain('extractNarrativeGraphSnapshot()');
      expect(providerSource).toContain('createNarrativeGraphSnapshotFromCanvasData(canvasData');
      expect(providerSource).toContain('sourceCanvasUri: documentUri');
      expect(narrativePreviewBridgeSource).toContain('createNarrativeGraphSnapshotFromCanvasData(');
      expect(narrativePreviewBridgeSource).toContain('NARRATIVE_RUNTIME_NODE_TYPES');
      expect(narrativePreviewBridgeSource).toContain('NARRATIVE_RUNTIME_CONNECTION_TYPES');
      expect(narrativePreviewBridgeSource).toContain('nodes.filter(isNarrativeRuntimeCanvasNode)');
      expect(narrativePreviewBridgeSource).not.toContain("'.nkstory'");
      expect(narrativePreviewBridgeSource).not.toContain("'.story'");
      expect(narrativePreviewBridgeSource).not.toContain("'.nks'");
    });

    it('keeps unsaved narrative metadata in Canvas status sync', () => {
      expect(canvasAppSource).toContain('narrativeSnapshotFingerprint');
      expect(canvasAppSource).toContain('narrative: canvasData.narrative');
      expect(canvasAppSource).toContain('nodes: canvasData.nodes');
      expect(canvasAppSource).toContain('connections: canvasData.connections');
      expect(providerSource).toContain("case 'canvasStatus'");
      expect(providerSource).toContain('this.rememberCanvasSnapshot(document, data)');
    });

    it('auto-refreshes open Preview sessions only for semantic Canvas changes', () => {
      expect(providerSource).toContain('canvasPreviewFingerprintsByDocumentUri');
      expect(providerSource).toContain('createCanvasPreviewSemanticFingerprint(canvasData)');
      expect(providerSource).toContain('updateRememberedCanvasSnapshot(');
      expect(providerSource).toContain('this.refreshNarrativePreview(documentUri)');
      expect(providerSource).toContain('refreshNarrativePreview(sourceCanvasUri?: string)');
      expect(providerSource).toContain('this.narrativePreviewBridge.refresh(sourceCanvasUri)');
      expect(providerSource).toContain(
        'extractNarrativeGraphSnapshotForSource(documentUri: string)',
      );
      expect(providerSource).toContain('CANVAS_PREVIEW_SEMANTIC_FINGERPRINT_KEYS');
      expect(providerSource).toContain("'nodes'");
      expect(providerSource).toContain("'connections'");
      expect(providerSource).toContain("'narrative'");
      expect(providerSource).not.toContain("'_selection',");
      expect(providerSource).not.toContain("'viewport',");
      expect(narrativePreviewBridgeSource).toContain('refresh(sourceCanvasUri?: string)');
      expect(narrativePreviewBridgeSource).toContain('extractNarrativeGraphSnapshotForSource');
    });

    it('routes revisioned Preview messages through a Canvas-owned bridge', () => {
      expect(providerSource).toContain('private readonly narrativePreviewBridge');
      expect(providerSource).toContain('openNarrativePreview()');
      expect(providerSource).toContain('return this.revealPlaybackWorkspace();');
      expect(providerSource).not.toContain('return this.narrativePreviewBridge.open();');
      expect(providerSource).toContain('refreshNarrativePreview(sourceCanvasUri?: string)');
      expect(providerSource).toContain('jumpNarrativePreviewToNode(nodeId: string)');
      expect(providerSource).toContain('setNarrativePreviewVariables(');
      expect(narrativePreviewBridgeSource).toContain("type: 'preview:loadGraph'");
      expect(narrativePreviewBridgeSource).toContain("type: 'preview:refresh'");
      expect(narrativePreviewBridgeSource).toContain("type: 'preview:jumpTo'");
      expect(narrativePreviewBridgeSource).toContain("type: 'preview:setVariables'");
      expect(narrativePreviewBridgeSource).toContain("type: 'preview:setFeatureToggles'");
      expect(narrativePreviewBridgeSource).toContain('requestId: this.createRequestId');
      expect(narrativePreviewBridgeSource).toContain('revision: snapshot.revision');
      expect(narrativePreviewBridgeSource).toContain('isStalePreviewMessage');
    });

    it('routes Preview highlights back to the source Canvas panel', () => {
      expect(providerSource).toContain('getNarrativePreviewTargetPanel(');
      expect(providerSource).toContain('message.sourceCanvasUri');
      expect(providerSource).toContain(
        'this.webviewPanelsByDocumentUri.get(message.sourceCanvasUri)',
      );
      expect(providerSource).toContain('postNarrativePreviewKeyboardAction(message');
      expect(providerSource).toContain(
        'this.postNarrativePreviewKeyboardAction(message, `selectNode:${message.nodeId}`)',
      );
      expect(providerSource).toContain('targetPanel.webview.postMessage({');
      expect(providerSource).toContain("type: 'narrativePreviewCanvasMessage'");
    });

    it('registers the Playback Workspace command without letting Preview read .nkc directly', () => {
      expect(extensionSource).toContain(
        "vscode.commands.registerCommand('neko.canvas.revealPlaybackWorkspace'",
      );
      expect(extensionSource).toContain('getNarrativePreviewFeatureToggles().preview');
      expect(extensionSource).toContain('await canvasEditorProvider.revealPlaybackWorkspace()');
      expect(extensionSource).toContain(
        "vscode.commands.registerCommand('neko.canvas.openNarrativePreview'",
      );
      expect(extensionSource).toContain(
        "vscode.commands.executeCommand('neko.canvas.revealPlaybackWorkspace')",
      );
      const canvasActionBranch = providerSource.slice(
        providerSource.indexOf("case 'canvasAction':"),
        providerSource.indexOf("case 'save':"),
      );
      expect(canvasActionBranch).toContain("message.action === 'revealPlaybackWorkspace'");
      expect(canvasActionBranch).toContain('this.setActiveCanvasEditor(webviewPanel, document);');
      expect(canvasActionBranch).toContain('await this.revealPlaybackWorkspace({');
      expect(canvasActionBranch).not.toContain(
        "vscode.commands.executeCommand('neko.canvas.openNarrativePreview')",
      );
      expect(providerSource).toContain("type: 'playback:revealWorkspace'");
      expect(providerSource).not.toContain('await this.openNarrativePreview();');
      expect(narrativePreviewBridgeSource).not.toContain('workspace.fs.readFile');
      expect(narrativePreviewBridgeSource).not.toContain('loadNkc(');
    });

    it('keeps Canvas document saves on the VS Code custom editor lifecycle', () => {
      expect(providerSource).toContain("case 'requestSave':");
      expect(providerSource).toContain('private async requestDocumentSave(');
      expect(providerSource).toContain('await vscode.workspace.save(document.uri)');
      expect(providerSource).toContain('async saveCustomDocument(');
      expect(providerSource).toContain('await requestCanvasProjectSnapshot');
      expect(providerSource).toContain('this.projectFileSession.save({');
      expect(providerSource).toContain("webviewPanel.webview.postMessage({ type: 'saved' })");
      const requestSaveBody = readMethodBody(providerSource, 'private async requestDocumentSave');
      expect(requestSaveBody).not.toContain("postMessage({ type: 'saved' })");
      expect(providerSource).toContain('CustomDocumentContentChangeEvent<vscode.CustomDocument>');
      expect(providerSource).not.toContain('CustomDocumentEditEvent<vscode.CustomDocument>');
      expect(providerSource).not.toContain('private async persistCanvasSnapshot(');
      expect(canvasAppSource).not.toContain("type: 'requestSave'");
      expect(canvasAppSource).not.toContain('useCanvasAutoSave');
      expect(canvasAppSource).not.toContain("type: 'save', data");
      expect(webviewSource).toContain("case 'saved':");
      expect(webviewSource).toContain('onSavedRef.current?.()');
    });

    it('removes legacy Canvas picker messages so tests cannot pass through old paths', () => {
      for (const caseName of [
        'pickMedia',
        'pickCanvasDocument',
        'pickMediaFile',
        'pickProjectDocument',
        'pickScriptDocument',
        'pickReferenceDocument',
        'pickModelReference',
        'pickFile',
      ]) {
        expect(providerSource, `${caseName} should not remain as a message case`).not.toContain(
          `case '${caseName}'`,
        );
      }
      expect(providerSource).not.toContain('rejectLegacyCanvasPickerMessage');
      expect(providerSource).not.toContain("postMessage({ type: 'dropAssets'");
      expect(providerSource).toContain('private createCanvasPickerSourceAddRequest');
      expect(providerSource).toContain('this.addCanvasProjectSource(');
      expect(providerSource).toContain('handleProjectSourceAddRequest(');
    });

    it('marks Canvas custom documents dirty with content-change events only', () => {
      const dirtyEventCalls = [
        ...providerSource.matchAll(/_onDidChangeCustomDocument\.fire\(\{([^)]*)\}\)/g),
      ].map((match) => match[1] ?? '');
      expect(dirtyEventCalls.length).toBeGreaterThan(0);
      expect(dirtyEventCalls.every((body) => body.includes('document'))).toBe(true);
      expect(
        dirtyEventCalls.every((body) => !body.includes('undo') && !body.includes('redo')),
      ).toBe(true);
    });

    it('contributes all Narrative Preview ablation settings', () => {
      const properties = canvasManifest.contributes.configuration.properties;
      expect(
        Object.keys(properties).filter((key) => key.startsWith('neko.canvas.narrative.')),
      ).toEqual([
        'neko.canvas.narrative.preview',
        'neko.canvas.narrative.typewriterEffect',
        'neko.canvas.narrative.autoExpressionMatch',
        'neko.canvas.narrative.showLockedChoices',
        'neko.canvas.narrative.previewAutoSync',
        'neko.canvas.narrative.live2dPerformance',
      ]);
    });

    it('registers a refresh command for saved Fountain scene updates', () => {
      expect(extensionSource).toContain(
        "vscode.commands.registerCommand('neko.canvas.refreshNarrativePreview'",
      );
      expect(extensionSource).toContain('canvasEditorProvider.refreshNarrativePreview()');
    });
  });

  describe('NKV-010: projected Canvas contracts', () => {
    it('exposes projection adapter registration and write-back through the extension API', () => {
      expect(extensionSource).toContain('projections: {');
      expect(extensionSource).toContain('registerProjectionAdapter(adapter)');
      expect(extensionSource).toContain('openProjectedCanvas(source)');
      expect(extensionSource).toContain('writeProjectionBack(source, changes)');
    });

    it('routes projected write-back requests through the provider instead of mutating JSON in webview', () => {
      expect(providerSource).toContain("case 'projection.writeBack'");
      expect(providerSource).toContain('this.writeProjectionBack(source, changes)');
      expect(providerSource).toContain('adapter.writeBack(changes)');
      expect(providerSource).toContain(
        "webviewPanel.webview.postMessage({ type: '_response', _requestId: requestId, result })",
      );
      expect(providerSource).toContain(
        'error: error instanceof Error ? error.message : String(error)',
      );
      expect(canvasAppSource).toContain("type: 'projection.writeBack'");
    });

    it('reports projected regeneration failures back to the webview as projection status', () => {
      expect(providerSource).toContain('tryRegenerateProjectedCanvas(');
      expect(providerSource).toContain('adapter.project()');
      expect(providerSource).toContain("type: 'projectionStatus'");
      expect(providerSource).toContain("state: 'writeback-error'");
    });

    it('saves projected canvas layout to cache path rather than the source document', () => {
      expect(providerSource).toContain('this.getProjectionCacheUri(');
      expect(providerSource).toContain('const data: ProjectedCanvasData = {');
      expect(providerSource).toContain('projectionSource: source,');
      expect(providerSource).toContain("'.neko', '.cache'");
    });
  });

  describe('NKV-011: subsystem status contracts', () => {
    it('guards malformed webview subsystem status before status-bar summary use', () => {
      expect(providerSource).toContain('!Array.isArray(reportedStatus)');
      expect(providerSource).toContain(
        'Array.isArray((reportedStatus as { activeSubsystems?: unknown }).activeSubsystems)',
      );
      expect(providerSource).toContain(
        "filter((item): item is string => typeof item === 'string')",
      );
    });
  });

  describe('NKV-012: canvas toolbar preview, export, and package intents', () => {
    it('routes toolbar playback workspace, export, and package actions through whitelisted paths', () => {
      expect(providerSource).toContain("case 'canvasAction'");
      expect(providerSource).toContain("message.action === 'revealPlaybackWorkspace'");
      expect(providerSource).toContain('this.setActiveCanvasEditor(webviewPanel, document);');
      expect(providerSource).toContain('await this.revealPlaybackWorkspace({');
      expect(providerSource).not.toContain(
        "vscode.commands.executeCommand('neko.canvas.openNarrativePreview')",
      );
      expect(providerSource).toContain("type: 'playback:revealWorkspace'");
      expect(providerSource).toContain("message.action === 'openExport'");
      expect(providerSource).toContain(
        "vscode.commands.executeCommand('neko.neko-canvas.slashCommand.export')",
      );
      expect(providerSource).toContain("message.action === 'openPackage'");
      expect(providerSource).toContain('createProjectSnapshotPackage({');
      expect(providerSource).toContain("packageId: 'neko-canvas'");
    });

    it('sends lightweight canvasAction intents from the webview toolbar', () => {
      expect(canvasAppSource).toContain("type: 'canvasAction'");
      expect(canvasAppSource).toContain("reportAction('toggleWorkspaceSurface', pane)");
      expect(canvasAppSource).toContain('onToggleWorkspaceSurface={handleToggleWorkspaceSurface}');
      expect(webviewSource).toContain("case 'playback:revealWorkspace'");
      expect(providerSource).toContain("case 'playback:getPreviewPlan'");
      expect(providerSource).toContain("type: 'playback:previewPlanResult'");
      expect(providerSource).toContain('requestedRevision < currentRevision');
      expect(providerSource).toContain('await this.extractCanvasPlaybackPlanForPreview(');
      expect(providerSource).toContain("case 'preview:resolveVariant'");
      expect(providerSource).toContain('await this.handlePreviewVariantMessage(');
      expect(providerSource).toContain("case 'media:probe'");
      expect(providerSource).toContain("case 'media:play'");
      expect(canvasAppSource).toContain("reportAction('openExport', t('toolbar.export'))");
      expect(canvasAppSource).toContain(
        "reportAction('openPackage', t('toolbar.package'), undefined, canvasData)",
      );
      expect(canvasAppSource).not.toContain("type: 'exportStoryboard'");
      expect(canvasAppSource).not.toContain("type: 'packageCanvas'");
    });

    it('routes storyboard action intents through Agent context instead of Canvas providers', () => {
      const storyboardIntentCase = providerSource.slice(
        providerSource.indexOf("case 'storyboardActionIntent'"),
        providerSource.indexOf("case 'getScriptIndex'"),
      );
      expect(containerRendererSource).toContain("type: 'storyboardActionIntent'");
      expect(providerSource).toContain("case 'storyboardActionIntent'");
      expect(providerSource).toContain('validateCanvasStoryboardActionIntent(intent)');
      expect(providerSource).toContain("type: 'canvas-storyboard-action-intent'");
      expect(providerSource).toContain("vscode.commands.executeCommand('neko.agent.sendContext'");
      expect(storyboardIntentCase).not.toContain('scheduler.enqueue');
    });

    it('routes Agent playback reorder through Canvas Webview graph commands', () => {
      expect(providerSource).toContain('getPlaybackPlan(sourceCanvasUri?: string)');
      expect(providerSource).toContain('createCutDraftFromRoute(');
      expect(providerSource).toContain('reorderPlaybackUnits(');
      expect(providerSource).toContain("'nodes.reorderSceneShots'");
      expect(providerSource).toContain('sourceRevision: this.getCanvasRevision(documentUri)');
      expect(webviewSource).toContain("case 'nodes.reorderSceneShots'");
      expect(canvasAppSource).toContain('reorderSceneShots: (request) => {');
      expect(canvasAppSource).toContain('.reorderSceneShots(request.sceneId');
      expect(providerSource).not.toContain('agentOrder');
      expect(providerSource).not.toContain('timelineOrder');
    });

    it('routes Canvas route matrix send-to-Cut through plan-derived draft handoff only', () => {
      expect(playbackWorkspaceSource).toContain("type: 'playback:createCutDraftFromRoute'");
      expect(playbackWorkspaceSource).toContain('routeId: row.routeId');
      expect(playbackWorkspaceSource).not.toContain('CanvasCutDraftPayload');
      expect(providerSource).toContain("case 'playback:createCutDraftFromRoute'");
      expect(providerSource).toContain('const draft = this.createCutDraftFromRoute({');
      expect(providerSource).toContain("'neko.cut.authoring.importCanvasDraft'");
      expect(providerSource).toContain('requestedRevision < currentRevision');
      expect(providerSource).not.toContain('message.cells');
      expect(providerSource).not.toContain('message.matrix');
      expect(routeStoryboardMatrixSource).toContain('projectRouteStoryboardMatrix');
      expect(routeStoryboardMatrixSource).toContain('resolveEffectiveCanvasPlaybackRoutes');
      expect(routeStoryboardMatrixSource).toContain('foldDuplicateRoutes');
      expect(routeStoryboardMatrixSource).not.toContain('timelineOrder');
    });
  });

  describe('NKV-013: document resource preview variants', () => {
    it('projects document resource refs before using authorized local-resource or Preview variant fallbacks', () => {
      expect(providerSource).toContain('createHostContentAccessRuntime');
      expect(providerSource).not.toContain('LegacyResourceCacheProvider');
      expect(providerSource).toContain('os.homedir() || workspaceRoot');
      expect(providerSource).not.toContain('process.env.HOME');
      expect(providerSource).toContain('projectResourceCacheVariant(');
      expect(providerSource).toContain('createDocumentResourceRefFromArchiveRef');
      expect(providerSource).toContain('resolvePreviewResourceRef(');
      expect(providerSource).toContain('const resourceRef = this.resolvePreviewResourceRef(');
      expect(providerSource).toContain('message.resourceRef');
      expect(providerSource).toContain('documentResourceRef');
      expect(providerSource).toContain('const documentResourceRef = isDocumentArchiveResourceRef');
      expect(providerSource).toContain("'neko-canvas.document-resource-variant'");
      expect(providerSource).toContain("type: 'preview:variantResolved'");
      expect(providerSource).toContain(
        'Resource cache variant could not be materialized for this document reference.',
      );
      expect(providerSource).not.toContain(
        'ResourceRef preview materialization failed; falling back to document path',
      );
      expect(providerSource).not.toContain("fallback: 'documentResourceRef'");

      const previewResolveBranch = providerSource.slice(
        providerSource.indexOf("case 'preview:resolveVariant':"),
        providerSource.indexOf("case 'preview:delegateAction':"),
      );
      expect(previewResolveBranch).toContain(
        'await this.handlePreviewVariantMessage(message, webviewPanel, document.uri);',
      );
      const previewVariantHandler = providerSource.slice(
        providerSource.indexOf('private async handlePreviewVariantMessage('),
        providerSource.indexOf('private async materializeCompositeRequestRuntimePaths('),
      );
      const documentPreviewProjector = providerSource.slice(
        providerSource.indexOf('private async projectDocumentResourcePreviewUrl('),
        providerSource.indexOf('private async materializeDocumentResourcePreview('),
      );
      expect(previewVariantHandler).toContain('this.projectDocumentResourcePreviewUrl({');
      expect(previewVariantHandler).toContain('resourceRef: assetPath ? undefined : resourceRef');
      expect(documentPreviewProjector).toContain('this.projectResourceCacheVariant(');
      expect(documentPreviewProjector).toContain(
        'Document resource cache Preview projection failed',
      );
      expect(providerSource).toContain(
        'private resolveDocumentResourceAssetPath(assetPath: string | undefined): string | undefined',
      );
      expect(providerSource).not.toContain('documentResourceRef.cachePath');
      expect(documentPreviewProjector).toContain(
        'this.resolveCanvasPlaybackLocalPreviewPathCandidates(',
      );
      expect(documentPreviewProjector).toContain('this.localResourceAccess.toWebviewUri(');
      expect(providerSource).toContain('private async resolvePreviewVariantAssetPath(');
      expect(providerSource).toContain('private isExistingLocalFile(');
      expect(providerSource).toContain('return fs.statSync(fsPath).isFile();');
      const playbackShotReferenceProjector = providerSource.slice(
        providerSource.indexOf("caller: 'neko-canvas.preview-playback-shot-reference'") - 260,
        providerSource.indexOf("caller: 'neko-canvas.preview-playback-shot-reference'") + 160,
      );
      expect(playbackShotReferenceProjector).toContain('documentUri');
      const playbackMediaResourceProjector = providerSource.slice(
        providerSource.indexOf("caller: 'neko-canvas.preview-playback-media-resource'") - 260,
        providerSource.indexOf("caller: 'neko-canvas.preview-playback-media-resource'") + 160,
      );
      expect(playbackMediaResourceProjector).toContain('documentUri');
      const playbackCandidateProjector = providerSource.slice(
        providerSource.indexOf('private async resolveCanvasPlaybackPreviewSourceCandidate('),
        providerSource.indexOf('private async resolveCanvasPlaybackLocalPreviewSource('),
      );
      expect(playbackCandidateProjector).toContain('documentUri');
      expect(playbackCandidateProjector).toContain(
        'resolveCanvasPlaybackPreviewPlayableAssetPath(',
      );
      const mediaPlaybackResolver = providerSource.slice(
        providerSource.indexOf('private async resolveMediaPlaybackFilePath('),
        providerSource.indexOf('private async handlePreviewVariantMessage('),
      );
      expect(mediaPlaybackResolver).toContain('this.resolvePreviewResourceRef');
      expect(mediaPlaybackResolver).toContain('this.resolveDocumentResourceAssetPath(');
      expect(mediaPlaybackResolver).toContain('this.resolveResourceRefLocalPreviewPath');
      expect(mediaPlaybackResolver).toContain(
        'this.resolveCanvasPlaybackLocalPreviewPathCandidates(',
      );
      const mediaPlaybackHandler = providerSource.slice(
        providerSource.indexOf('private async handleMediaPlaybackMessage('),
        providerSource.indexOf('private async resolveMediaPlaybackFilePath('),
      );
      expect(mediaPlaybackHandler).toContain(
        '...this.readNarrativePreviewSessionEnvelope(message)',
      );
      expect(mediaPlaybackHandler).toContain('Media stream could not be created for this source.');
      expect(providerSource).toContain('private async postMediaPlaybackResponse(');
      expect(mediaPlaybackHandler).toContain(
        'await this.postMediaPlaybackResponse(webviewPanel, {',
      );
      expect(providerSource).toContain(
        'Media playback response could not be delivered to the Preview webview.',
      );
      const canvasLoadNormalizer = providerSource.slice(
        providerSource.indexOf('private async normalizeCanvasPathsForLoad('),
        providerSource.indexOf('private projectLocalResource('),
      );
      expect(canvasLoadNormalizer).toContain('this.projectCanvasMediaLocalFile(');
      expect(canvasLoadNormalizer).toContain("['assetPath', 'runtimeAssetPath']");
      expect(canvasLoadNormalizer).toContain("['thumbnailPath', 'runtimeThumbnailPath']");
      expect(canvasLoadNormalizer).toContain('nodeData[runtimeKey] = uri;');
      expect(canvasLoadNormalizer).not.toContain('nodeData[key] = uri;');
      expect(canvasLoadNormalizer).not.toContain('this.resolveAssetPath(value');
      const canvasMediaProjector = providerSource.slice(
        providerSource.indexOf('private async projectCanvasMediaLocalFile('),
        providerSource.indexOf('private async addFeatureRoot('),
      );
      expect(canvasMediaProjector).toContain(
        'this.resolveCanvasPlaybackLocalPreviewPathCandidates(',
      );
      expect(canvasMediaProjector).toContain('this.localResourceAccess.toWebviewUri(');
      expect(canvasMediaProjector).toContain('...this.getCanvasLocalResourceRoots(documentUri)');
      const openMediaPreviewBranch = providerSource.slice(
        providerSource.indexOf("case 'openMediaPreview':"),
        providerSource.indexOf("case 'preview:resolveVariant':"),
      );
      expect(openMediaPreviewBranch).toContain('this.resolveCanvasMaterialLocalFilePath(');
      expect(openMediaPreviewBranch).not.toContain('await this.resolveAssetPath(');
      const captureFrameBranch = providerSource.slice(
        providerSource.indexOf("case 'media:captureFrame':"),
        providerSource.indexOf("case 'media:requestPanoramicThumbnail':"),
      );
      expect(captureFrameBranch).toContain('this.resolveCanvasMediaLocalFilePath(');
      expect(captureFrameBranch).not.toContain('await this.resolveAssetPath(assetPath!');
      const panoramicThumbnailBranch = providerSource.slice(
        providerSource.indexOf("case 'media:requestPanoramicThumbnail':"),
        providerSource.indexOf('private requestId = 0;'),
      );
      expect(panoramicThumbnailBranch).toContain('this.resolveCanvasMediaLocalFilePath(');
      expect(narrativePreviewBridgeSource).toContain(
        'documentResourceRef: metadata.previewSourceDocumentResourceRef',
      );
      expect(narrativePreviewBridgeSource).toContain('readString(metadata.previewSourceAssetPath)');
      expect(narrativePreviewMediaRuntimeSource).toContain(
        'readonly documentResourceRef?: unknown',
      );
      expect(narrativePreviewMediaRuntimeSource).toContain(
        'documentResourceRef: request.documentResourceRef',
      );
      expect(narrativePreviewMediaRuntimeSource).toContain(
        'documentResourceRef: player.documentResourceRef',
      );
      expect(narrativePreviewBridgeSource).toContain(
        'HOST_PREVIEW_MEDIA_RESPONSE_TIMEOUT_MS = 10_000',
      );
      expect(narrativePreviewBridgeSource).toContain('handlePreviewMediaRequest(');
      expect(narrativePreviewBridgeSource).toContain(
        'Preview media playback is unavailable for this Canvas host.',
      );
      expect(narrativePreviewBridgeSource).toContain('mediaProbeTimeout');
      expect(narrativePreviewBridgeSource).toContain('mediaStreamTimeout');
      expect(providerSource).toContain(
        'Media playback requires probe metadata before stream creation.',
      );
      expect(narrativePreviewMediaRuntimeSource).toContain(
        'HOST_MEDIA_RESPONSE_TIMEOUT_MS = 10_000',
      );
      expect(narrativePreviewMediaRuntimeSource).toContain('scheduleHostResponseTimeout(');
      expect(narrativePreviewMediaRuntimeSource).toContain('clearHostResponseTimeout(');
      expect(narrativePreviewMediaRuntimeSource).toContain('probeTimeout');
      expect(narrativePreviewMediaRuntimeSource).toContain('streamTimeout');
      expect(narrativePreviewMediaRuntimeSource).toContain(
        'lastStartRequest?: PreviewMediaStartRequest',
      );
      expect(narrativePreviewMediaRuntimeSource).toContain(
        'probeMediaInfo?: Record<string, unknown>',
      );
      expect(narrativePreviewMediaRuntimeSource).toContain('function requestMediaStream(player');
      expect(narrativePreviewMediaRuntimeSource).toContain('if (player.shouldPlayWhenReady) {');
      expect(narrativePreviewMediaRuntimeSource).toContain("player.root.dataset.state = 'ready'");
      expect(narrativePreviewMediaRuntimeSource.indexOf('function handleProbeResult')).toBeLessThan(
        narrativePreviewMediaRuntimeSource.indexOf('function requestMediaStream'),
      );
      const runtimeProbeResultHandler = narrativePreviewMediaRuntimeSource.slice(
        narrativePreviewMediaRuntimeSource.indexOf('function handleProbeResult'),
        narrativePreviewMediaRuntimeSource.indexOf('function requestMediaStream'),
      );
      expect(runtimeProbeResultHandler).not.toContain("type: 'media:play'");
      expect(narrativePreviewMediaRuntimeSource).toContain('shouldRestartMediaProbe(player)');
      expect(narrativePreviewMediaRuntimeSource).toContain("player.root.dataset.state === 'error'");
      expect(narrativePreviewMediaRuntimeSource).toContain(
        "type PreviewMediaRuntimeEventType = 'ready' | 'timeUpdate' | 'ended' | 'error'",
      );
      expect(narrativePreviewMediaRuntimeSource).toContain("new CustomEvent('neko-preview-media'");
      expect(narrativePreviewMediaRuntimeSource).toContain(
        "dispatchMediaRuntimeEvent(player, 'ended')",
      );
      expect(narrativePreviewMediaRuntimeSource).toContain(
        "dispatchMediaRuntimeEvent(player, 'error'",
      );
      expect(narrativePreviewMediaRuntimeSource).toContain(
        "dispatchMediaRuntimeEvent(player, 'timeUpdate')",
      );
      expect(narrativePreviewBridgeSource).toContain(
        "window.addEventListener('neko-preview-media'",
      );
      expect(narrativePreviewBridgeSource).toContain('advanceAfterCurrentUnit()');
      expect(documentPreviewProjector.indexOf('this.projectResourceCacheVariant(')).toBeLessThan(
        documentPreviewProjector.indexOf('this.resolveDocumentResourceAssetPath('),
      );
      expect(
        documentPreviewProjector.indexOf('this.resolveDocumentResourceAssetPath('),
      ).toBeLessThan(documentPreviewProjector.indexOf('this.localResourceAccess.toWebviewUri('));
      expect(previewVariantHandler).toContain("caller: 'neko-canvas.document-resource-variant'");
      expect(
        previewVariantHandler.indexOf('this.projectDocumentResourcePreviewUrl({'),
      ).toBeLessThan(
        previewVariantHandler.indexOf('const variantApi = await this.getPreviewVariantApi();'),
      );
      expect(previewVariantHandler).toContain('this.resolvePreviewVariantAssetPath(assetPath');
      expect(previewVariantHandler).not.toContain(
        'const fsPath = await this.resolveAssetPath(assetPath',
      );
      expect(previewVariantHandler).toContain(
        'Preview variant request did not include a resolvable asset or resource reference.',
      );
      expect(previewVariantHandler).toContain("error: 'Preview variant request did not include");
      expect(previewResolveBranch).not.toContain('this.projectLocalResource(');
      expect(previewResolveBranch).not.toContain('registerPreviewAsset');
    });

    it('keeps Canvas media import storage paths separate from runtime webview URLs', () => {
      expect(providerSource).toContain('private async handleCanvasProjectAddSource(');
      expect(providerSource).toContain('private async addCanvasProjectSource(');
      expect(providerSource).toContain('ingestProjectSourceAddRequest(');
      expect(providerSource).toContain('const runtimeAssetPath =');
      expect(providerSource).not.toContain('private projectLocalResource(');
      expect(providerSource).not.toContain('this.projectLocalResource(');
      expect(providerSource).toContain('await this.projectCanvasMediaLocalFile(');
      expect(providerSource).toContain('...(runtimeAssetPath ? { runtimeAssetPath } : {}),');
      expect(providerSource).toContain('postProjectSourceAddResult');
      expect(providerSource).toContain('handleProjectSourceAddHostRequest(sourceRequest');
      expect(providerSource).toContain('contractedPath');
      expect(providerSource).toContain('contractExternalAssetPath(');
      expect(providerSource).toContain("'neko-canvas.project-add-source.file-picker'");
      expect(providerSource).toContain("'neko-canvas.project-add-source'");
      expect(providerSource).toContain('resolveCanvasMediaPathForSave(');
      expect(providerSource).toContain('resolveWorkspaceVariableAssetPathCandidates(');
      expect(providerSource).toContain('contractWorkspaceMediaPath(');
      expect(providerSource).toContain('contractWorkspaceAssetPath(');
      expect(providerSource).toContain('getOwningCanvasWorkspaceRoot(');
      expect(providerSource).toContain('isWorkspaceScopedVariablePath(');
      expect(providerSource).toContain('return relativePath || undefined;');
      expect(providerSource).toContain('Canvas asset path is not portable');
      expect(providerSource).not.toContain('// Fallback: relative to document directory');
      expect(providerSource).not.toContain('path.relative(docDir, absolutePath)');
      expect(providerSource).not.toContain(
        'return relativePath ? `\\${WORKSPACE}/${relativePath}`',
      );
      expect(providerSource).toContain('this.createCanvasWorkspaceMediaPathContext(documentUri)');
      expect(canvasAppSource).not.toContain('runtimeAssetPath: options.runtimeAssetPath');
      expect(canvasAppSource).toContain('runtimeAssetPath: asset.runtimeAssetPath');
      expect(webviewSource).not.toContain('message.runtimeAssetPath');
      expect(webviewSource).not.toMatch(/case ['"](?:addMedia|dropMedia|dropAssets)['"]/);
      expect(
        readFileSync(join(__dirname, '../../../webview/src/hooks/useDragDrop.ts'), 'utf-8'),
      ).toContain("const runtimeAssetPath = metadata?.['runtimeAssetPath'];");
    });

    it('normalizes persisted media preview bindings to durable asset paths', () => {
      const bindingNormalizer = extractFunction(
        providerSource,
        'normalizeCanvasContentBindingsForSave',
      );

      expect(bindingNormalizer).toContain(
        "normalizeCanvasAssetPreviewBindings(content, '/assetPath');",
      );
      expect(bindingNormalizer).not.toContain("'/runtimeAssetPath'");
      expect(providerSource).toContain("delete nodeData['runtimeAssetPath'];");
      expect(providerSource).toContain("delete nodeData['runtimeThumbnailPath'];");
    });

    it('does not reconfigure Canvas Webview roots while resolving add-source previews', () => {
      const addSource = extractFunction(providerSource, 'private async addCanvasProjectSource');

      expect(addSource).toContain('projectCanvasMediaLocalFile(');
      expect(addSource).not.toContain('configureWebview(');
      expect(addSource).not.toContain('addFeatureRoot(');
      expect(providerSource).not.toContain('private async addFeatureRoot(');
    });
  });

  describe('source file existence', () => {
    it('canvasEditorProvider.ts is non-empty', () => {
      expect(providerSource.length).toBeGreaterThan(100);
    });

    it('exports CanvasEditorProvider class', () => {
      expect(providerSource).toContain('export class CanvasEditorProvider');
    });
  });

  describe('Layout status migration', () => {
    it('projects subsystem and projection status to the native status bar', () => {
      const statusSource = readFileSync(join(__dirname, '../views/canvasStatusBar.ts'), 'utf-8');

      expect(providerSource).toContain('readCanvasProjectionSummary(canvasData)');
      expect(providerSource).toContain('projectionSummary,');
      expect(canvasAppSource).toContain('projectionStatus,');
      expect(statusSource).toContain('neko.canvas.context');
      expect(statusSource).toContain('contextParts.join');
    });

    it('removes lower-left Canvas surface status overlays', () => {
      expect(canvasAppSource).not.toContain('absolute left-3 bottom-3');
      expect(canvasAppSource).not.toContain('absolute left-3 bottom-10');
      expect(canvasAppSource).not.toContain('formatProjectionStatus(');
    });
  });

  it('uses the typed neko-assets API for asset entity lookup without command fallback', () => {
    expect(extensionSource).toContain('resolveNekoExtension(NEKO_EXTENSION_IDS.NEKO_ASSETS');
    expect(extensionSource).toContain('isNekoAssetsAPI(api)');
    expect(extensionSource).toContain('api.getAllEntities()');
    expect(extensionSource).toContain('typed Neko Assets API is unavailable');
    expect(extensionSource).not.toContain("'neko.assets.getAllEntities'");
  });
});

function extractFunction(source: string, functionName: string): string {
  const functionIndex = source.indexOf(functionName);
  if (functionIndex < 0) return '';
  const braceIndex = source.indexOf('{', functionIndex);
  if (braceIndex < 0) return '';

  let depth = 0;
  for (let index = braceIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceIndex + 1, index);
      }
    }
  }
  return '';
}
