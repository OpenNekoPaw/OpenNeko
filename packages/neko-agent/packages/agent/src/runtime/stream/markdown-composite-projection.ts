import {
  isCompositeContentFenceLanguage,
  parseCompositeContentJson,
  type ContentBlock,
} from '@neko-agent/types';
import { isMarkdownParentNode, parseNormalizedMarkdown, type MarkdownNode } from '@neko/markdown';

export type AgentStreamCompositeProjector = (
  composite: NonNullable<ContentBlock['composite']>,
) => NonNullable<ContentBlock['composite']>;

export interface ProjectMarkdownDerivedCompositeBlocksInput {
  readonly sourceBlock: ContentBlock;
  readonly projectCompositeBlock?: AgentStreamCompositeProjector;
}

/**
 * Projects semantic composite metadata from normalized Markdown code-block nodes.
 * The source text is never rewritten: Webview presentation remains owned by the
 * normalized Markdown adapter and these blocks only carry derived semantics.
 */
export function projectMarkdownDerivedCompositeBlocks(
  input: ProjectMarkdownDerivedCompositeBlocksInput,
): ContentBlock[] {
  const source = input.sourceBlock.content ?? '';
  const parsed = parseNormalizedMarkdown(source);
  if (parsed.status !== 'ready') {
    throw new Error(
      `Normalized Markdown composite projection failed: ${parsed.diagnostics
        .map((diagnostic) => diagnostic.code)
        .join('; ')}.`,
    );
  }

  const blocks: ContentBlock[] = [];
  let compositeOrdinal = 0;
  for (const node of collectCodeBlockNodes(parsed.document.root)) {
    const language = node.language.normalized ?? node.language.raw;
    if (!isCompositeContentFenceLanguage(language)) continue;

    const composites = parseCompositeContentJson(node.value);
    for (let candidateIndex = 0; candidateIndex < composites.length; candidateIndex += 1) {
      const composite = composites[candidateIndex];
      if (!composite) continue;
      compositeOrdinal += 1;
      blocks.push({
        id: `${input.sourceBlock.id}-composite-${compositeOrdinal}`,
        type: 'composite',
        timestamp: input.sourceBlock.timestamp,
        composite: input.projectCompositeBlock?.(composite) ?? composite,
        compositeSource: {
          kind: 'normalized-markdown-code-block',
          sourceBlockId: input.sourceBlock.id,
          startOffset: node.range.startOffset,
          endOffset: node.range.endOffset,
          ...(language ? { language } : {}),
          candidateIndex,
        },
      });
    }
  }
  return blocks;
}

function collectCodeBlockNodes(
  root: MarkdownNode,
): readonly Extract<MarkdownNode, { readonly type: 'codeBlock' }>[] {
  const nodes: Array<Extract<MarkdownNode, { readonly type: 'codeBlock' }>> = [];
  visit(root);
  return nodes;

  function visit(node: MarkdownNode): void {
    if (node.type === 'codeBlock') nodes.push(node);
    if (!isMarkdownParentNode(node)) return;
    for (const child of node.children) visit(child);
  }
}
