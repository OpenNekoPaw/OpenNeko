import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DEFAULT_AGENT_HOST_SOURCES = [
  '../chat/chatProvider.ts',
  '../chat/agentMessageTurnHandler.ts',
  '../chat/message/agentTurnBridge.ts',
  '../chat/message/agentStreamProcessor.ts',
  './mediaTurnBridge.ts',
] as const;

describe('creative output destination architecture', () => {
  it('poisons the legacy multi-Board and runtime-draft path in default Agent assembly', () => {
    const source = DEFAULT_AGENT_HOST_SOURCES.map((relativePath) =>
      readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    ).join('\n');

    for (const forbidden of [
      'AgentCanvasBoardCoordinator',
      'AgentCanvasBoardWorkRuntime',
      'canvasBoardWork',
      'canvasBoards',
      'CanvasBoardIndexService',
      'CanvasGeneratedDraftProjectionService',
      'deliverGeneratedAssets',
      'deliverCreatorMarkdown',
    ]) {
      expect(source, `default Agent host must not reference ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('keeps ordinary media completion out of Cut projects', () => {
    const agentDeliverySource = readFileSync(
      new URL('./mediaTaskDeliveryHost.ts', import.meta.url),
      'utf8',
    );
    const tuiDeliverySource = readFileSync(
      new URL(
        '../../../../../../apps/neko-tui/src/tui/host/node-media-task-delivery-host.ts',
        import.meta.url,
      ),
      'utf8',
    );
    const canvasEditorSource = readFileSync(
      new URL(
        '../../../../../neko-canvas/packages/extension/src/editor/canvasEditorProvider.ts',
        import.meta.url,
      ),
      'utf8',
    );

    expect(agentDeliverySource).not.toContain('neko.cut');
    expect(agentDeliverySource).not.toContain('.nkv');
    expect(tuiDeliverySource).not.toContain('neko.cut');
    expect(tuiDeliverySource).not.toContain('.nkv');
    expect(canvasEditorSource).not.toContain('pushGeneratedToCut');
    expect(canvasEditorSource).not.toContain('neko.cut.importGeneratedClip');
  });
});
