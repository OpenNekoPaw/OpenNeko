/**
 * MemoryWrite Tool
 *
 * Allows the Agent to propose facts, decisions, and preferences for the
 * project-level memory file. The Agent does not commit `.neko/memory.md`
 * directly; clients or domain runtimes validate and persist accepted proposals.
 */

import type { ToolResult, ToolCategory, ToolParameters, ToolExecuteOptions } from '@neko/shared';
import { BuiltinTool } from '@neko/shared';
import { presentInvalidToolArguments, presentMemoryWriteFailure } from './core-tool-presentation';

export type ProjectMemoryMutationAction = 'upsert' | 'remove';

export interface ProjectMemoryMutationProposal {
  readonly kind: 'project-memory-mutation';
  readonly action: ProjectMemoryMutationAction;
  readonly key: string;
  readonly content?: string;
}

export interface ProjectMemoryMutationProposalSink {
  proposeProjectMemoryMutation(
    proposal: ProjectMemoryMutationProposal,
  ): Promise<{ readonly proposalId?: string } | void>;
}

export interface MemoryWriteToolOptions {
  readonly proposalSink?: ProjectMemoryMutationProposalSink;
}

export class MemoryWriteTool extends BuiltinTool {
  readonly name = 'MemoryWrite';
  readonly description =
    'Propose a fact, decision, or preference update for project memory. The Agent does not write .neko/memory.md directly; the client or entity/runtime owner validates and commits accepted proposals. ' +
    'Use `upsert` to propose creating or updating a named section; use `remove` to propose deleting one. ' +
    'Good sections: "User Preferences", "Project Architecture", "Recent Decisions", "Key Conventions".';

  readonly parameters: ToolParameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['upsert', 'remove'],
        description: '`upsert` creates or replaces the section; `remove` deletes it.',
      },
      key: {
        type: 'string',
        description:
          'Section heading (e.g. "User Preferences"). Used as the ## heading in memory.md.',
      },
      content: {
        type: 'string',
        description:
          'Markdown body for the section. Required when action is `upsert`. ' +
          'Use bullet points for lists of facts.',
      },
    },
    required: ['action', 'key'],
  };

  readonly category: ToolCategory = 'system';
  override readonly requiresConfirmation = false;

  constructor(private readonly options: MemoryWriteToolOptions = {}) {
    super();
  }

  async execute(args: Record<string, unknown>, options?: ToolExecuteOptions): Promise<ToolResult> {
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      return this.error(presentInvalidToolArguments(this.name, options?.metadata?.['locale']));
    }

    const action = args.action as 'upsert' | 'remove';
    const key = args.key as string;

    if (!key.trim()) {
      return this.error(
        presentMemoryWriteFailure('empty-key', undefined, options?.metadata?.['locale']),
      );
    }

    const proposal = createProjectMemoryMutationProposal(action, key, args.content);
    if (!proposal) {
      return this.error(
        presentMemoryWriteFailure('content-required', undefined, options?.metadata?.['locale']),
      );
    }

    try {
      const sinkResult = await this.options.proposalSink?.proposeProjectMemoryMutation(proposal);
      return this.success({
        proposal,
        committed: false,
        ...(sinkResult?.proposalId ? { proposalId: sinkResult.proposalId } : {}),
      });
    } catch (err) {
      return this.error(
        presentMemoryWriteFailure(
          'proposal-failed',
          err instanceof Error ? err.message : String(err),
          options?.metadata?.['locale'],
        ),
      );
    }
  }
}

function createProjectMemoryMutationProposal(
  action: ProjectMemoryMutationAction,
  key: string,
  rawContent: unknown,
): ProjectMemoryMutationProposal | undefined {
  if (action === 'upsert') {
    if (rawContent === undefined || rawContent === null) {
      return undefined;
    }
    return {
      kind: 'project-memory-mutation',
      action,
      key,
      content: String(rawContent),
    };
  }
  return {
    kind: 'project-memory-mutation',
    action,
    key,
  };
}
