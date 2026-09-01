import { describe, expect, it } from 'vitest';
import {
  AGENT_TERMINAL_ARTIFACT_MARKER,
  AGENT_TERMINAL_NEXT_ACTION_MARKER,
  AgentTerminalMarkdownContractError,
  createAgentTerminalArtifactAdmission,
  parseAgentTerminalMarkdown,
} from './agent-terminal-markdown';

describe('Agent terminal Markdown contract', () => {
  it('keeps ordinary Markdown as the conversational summary', () => {
    expect(parseAgentTerminalMarkdown('  ## Answer\n\nDone.  ')).toEqual({
      summaryMarkdown: '## Answer\n\nDone.',
    });
  });

  it('projects an admitted artifact without changing its Markdown body', () => {
    const result = parseAgentTerminalMarkdown(
      `Saved the reviewable plan.\n\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n\n# Animation Plan\n\n## Scope\n\nKeep this.`,
      createAgentTerminalArtifactAdmission(),
    );

    expect(result).toEqual({
      summaryMarkdown: 'Saved the reviewable plan.',
      artifact: {
        kind: 'reviewable-markdown',
        title: 'Animation Plan',
        profile: 'reviewable-markdown',
        markdown: '# Animation Plan\n\n## Scope\n\nKeep this.',
      },
    });
  });

  it('separates one recommended next action from the summary and artifact body', () => {
    const result = parseAgentTerminalMarkdown(
      `Saved the reviewable plan.\n\n${AGENT_TERMINAL_NEXT_ACTION_MARKER}\n\nGenerate the prepared opening shot.\n\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n\n# Animation Plan\n\n## Scope\n\nKeep this.`,
      createAgentTerminalArtifactAdmission(),
    );

    expect(result).toEqual({
      summaryMarkdown: 'Saved the reviewable plan.',
      recommendedNextActionMarkdown: 'Generate the prepared opening shot.',
      artifact: {
        kind: 'reviewable-markdown',
        title: 'Animation Plan',
        profile: 'reviewable-markdown',
        markdown: '# Animation Plan\n\n## Scope\n\nKeep this.',
      },
    });
  });

  it('does not interpret a marker inside a fenced code block', () => {
    const markdown = `Example:\n\n\`\`\`md\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n\`\`\``;
    expect(parseAgentTerminalMarkdown(markdown)).toEqual({ summaryMarkdown: markdown });
  });

  it.each([
    {
      markdown: `Summary\n\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n\n# Document`,
      admission: undefined,
      code: 'AGENT_TERMINAL_ARTIFACT_NOT_ADMITTED',
    },
    {
      markdown: `Summary\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n# One\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n# Two`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_ARTIFACT_MARKER_REPEATED',
    },
    {
      markdown: `${AGENT_TERMINAL_ARTIFACT_MARKER}\n# Document`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_SUMMARY_MISSING',
    },
    {
      markdown: `Summary\n${AGENT_TERMINAL_ARTIFACT_MARKER}`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_ARTIFACT_MISSING',
    },
    {
      markdown: `Summary\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n## Not an H1`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_ARTIFACT_TITLE_MISSING',
    },
    {
      markdown: `Summary\n${AGENT_TERMINAL_NEXT_ACTION_MARKER}\nDo this.`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_NEXT_ACTION_WITHOUT_ARTIFACT',
    },
    {
      markdown: `Summary\n${AGENT_TERMINAL_NEXT_ACTION_MARKER}\nOne\n${AGENT_TERMINAL_NEXT_ACTION_MARKER}\nTwo\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n# Document`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_NEXT_ACTION_MARKER_REPEATED',
    },
    {
      markdown: `Summary\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n# Document\n${AGENT_TERMINAL_NEXT_ACTION_MARKER}\nDo this.`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_NEXT_ACTION_ORDER_INVALID',
    },
    {
      markdown: `Summary\n${AGENT_TERMINAL_NEXT_ACTION_MARKER}\n${AGENT_TERMINAL_ARTIFACT_MARKER}\n# Document`,
      admission: createAgentTerminalArtifactAdmission(),
      code: 'AGENT_TERMINAL_NEXT_ACTION_MISSING',
    },
  ])('rejects invalid artifact contract $code', ({ markdown, admission, code }) => {
    expect(() => parseAgentTerminalMarkdown(markdown, admission)).toThrowError(
      expect.objectContaining<Partial<AgentTerminalMarkdownContractError>>({ code }),
    );
  });
});
