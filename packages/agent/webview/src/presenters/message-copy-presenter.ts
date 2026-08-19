import type { Message } from '@neko/agent-contracts';
import { projectAssistantTurn, projectContentBlocksUi } from './content-block-presenter';

export function projectMessageCopyText(message: Message): string | null {
  if (message.role !== 'assistant' || message.isError || !message.contentBlocks?.length) {
    return nonEmptyText(message.content);
  }

  const turn = projectAssistantTurn(
    projectContentBlocksUi(message.contentBlocks, message.isStreaming === true),
    message.turnTiming,
  );
  const answer = turn.answer.flatMap((projection) =>
    projection.renderKind === 'markdown' ? [projection.content.trim()] : [],
  );
  return nonEmptyText(answer.filter(Boolean).join('\n\n'));
}

function nonEmptyText(value: string): string | null {
  const text = value.trim();
  return text.length > 0 ? text : null;
}
