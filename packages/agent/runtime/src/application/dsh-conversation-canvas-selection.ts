import type { CanvasWorkspaceContextCatalog } from '@neko/canvas-domain';
import type { DshComposerContextProjection } from '@neko/agent-contracts/dsh-session-host';
import type { DshConversationCatalogStore } from './dsh-conversation-catalog-repository';

export function createDshConversationCanvasSelection(
  conversations: Pick<DshConversationCatalogStore, 'get' | 'readCanvasSelection' | 'selectCanvas'>,
) {
  const requireWorkspace = async (
    conversationId: string,
    canvas: CanvasWorkspaceContextCatalog,
  ) => {
    const record = await conversations.get(conversationId);
    if (
      record === undefined ||
      (record.context.kind !== 'workspace' && record.context.kind !== 'authoring') ||
      record.context.workspaceId !== canvas.workspaceId
    ) {
      throw new Error('Composer Canvas catalog does not match the Conversation Workspace.');
    }
  };
  return Object.freeze({
    async project(
      conversationId: string,
      canvas: CanvasWorkspaceContextCatalog,
    ): Promise<
      Pick<DshComposerContextProjection, 'canvasSelection' | 'canvasSelectionDiagnostic'>
    > {
      await requireWorkspace(conversationId, canvas);
      const selected = await conversations.readCanvasSelection(conversationId);
      if (
        selected === undefined ||
        canvas.options.some((option) => option.target.canvasId === selected)
      ) {
        return {
          canvasSelection: { conversationId, canvasId: selected ?? canvas.defaultTarget.canvasId },
        };
      }
      return {
        canvasSelection: { conversationId, canvasId: canvas.defaultTarget.canvasId },
        canvasSelectionDiagnostic:
          'The saved Canvas selection is unavailable; the Workspace default is selected.',
      };
    },
    async select(
      conversationId: string,
      canvas: CanvasWorkspaceContextCatalog,
      canvasId: string,
    ): Promise<void> {
      await requireWorkspace(conversationId, canvas);
      const option = canvas.options.find((candidate) => candidate.target.canvasId === canvasId);
      if (option === undefined || option.disabled === true) {
        throw new Error(option?.diagnostic ?? 'The selected Canvas is unavailable.');
      }
      await conversations.selectCanvas(conversationId, option.target);
    },
  });
}
