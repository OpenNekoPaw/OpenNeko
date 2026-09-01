export const AGENT_TERMINAL_ARTIFACT_MARKER = '<!-- neko:artifact -->';
export const AGENT_TERMINAL_NEXT_ACTION_MARKER = '<!-- neko:next-action -->';
export const DEFAULT_AGENT_DOCUMENT_PROFILE_ID = 'reviewable-markdown';

export type DocumentProfileId = string;

export interface AgentTerminalArtifactAdmission {
  readonly profile: DocumentProfileId;
}

export interface AgentTerminalResult {
  /** Always present and projected as the final conversational reply. */
  readonly summaryMarkdown: string;
  /** A single creator-facing action rendered after the admitted document reference. */
  readonly recommendedNextActionMarkdown?: string;
  /** Present only for an explicitly admitted long-term Markdown document. */
  readonly artifact?: {
    readonly kind: 'reviewable-markdown';
    readonly title: string;
    readonly profile: DocumentProfileId;
    readonly markdown: string;
  };
}

export type AgentTerminalMarkdownDiagnosticCode =
  | 'AGENT_TERMINAL_ARTIFACT_NOT_ADMITTED'
  | 'AGENT_TERMINAL_ARTIFACT_MARKER_REPEATED'
  | 'AGENT_TERMINAL_SUMMARY_MISSING'
  | 'AGENT_TERMINAL_ARTIFACT_MISSING'
  | 'AGENT_TERMINAL_ARTIFACT_TITLE_MISSING'
  | 'AGENT_TERMINAL_ARTIFACT_PROFILE_INVALID'
  | 'AGENT_TERMINAL_NEXT_ACTION_WITHOUT_ARTIFACT'
  | 'AGENT_TERMINAL_NEXT_ACTION_MARKER_REPEATED'
  | 'AGENT_TERMINAL_NEXT_ACTION_ORDER_INVALID'
  | 'AGENT_TERMINAL_NEXT_ACTION_MISSING';

export class AgentTerminalMarkdownContractError extends Error {
  override readonly name = 'AgentTerminalMarkdownContractError';

  constructor(
    readonly code: AgentTerminalMarkdownDiagnosticCode,
    message: string,
  ) {
    super(message);
  }
}

export function createAgentTerminalArtifactAdmission(
  profile: DocumentProfileId = DEFAULT_AGENT_DOCUMENT_PROFILE_ID,
): AgentTerminalArtifactAdmission {
  const normalized = profile.trim();
  if (!/^[a-z][a-z0-9-]{0,63}$/u.test(normalized)) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_ARTIFACT_PROFILE_INVALID',
      `Agent terminal artifact profile '${profile}' is invalid.`,
    );
  }
  return Object.freeze({ profile: normalized });
}

/** Parses the single Markdown-native terminal contract without interpreting document semantics. */
export function parseAgentTerminalMarkdown(
  value: string,
  admission?: AgentTerminalArtifactAdmission,
): AgentTerminalResult {
  const markdown = value.trim();
  const artifactMarkerLines = findMarkerLines(markdown, AGENT_TERMINAL_ARTIFACT_MARKER);
  const nextActionMarkerLines = findMarkerLines(markdown, AGENT_TERMINAL_NEXT_ACTION_MARKER);
  if (artifactMarkerLines.length === 0) {
    if (nextActionMarkerLines.length > 0) {
      throw new AgentTerminalMarkdownContractError(
        'AGENT_TERMINAL_NEXT_ACTION_WITHOUT_ARTIFACT',
        'Agent terminal Markdown cannot declare a next action without an artifact.',
      );
    }
    return { summaryMarkdown: markdown };
  }
  if (admission === undefined) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_ARTIFACT_NOT_ADMITTED',
      'Agent terminal Markdown contains an artifact marker without Host admission.',
    );
  }
  createAgentTerminalArtifactAdmission(admission.profile);
  if (artifactMarkerLines.length !== 1) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_ARTIFACT_MARKER_REPEATED',
      'Agent terminal Markdown must contain exactly one artifact marker.',
    );
  }
  if (nextActionMarkerLines.length > 1) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_NEXT_ACTION_MARKER_REPEATED',
      'Agent terminal Markdown must contain at most one next-action marker.',
    );
  }

  const lines = markdown.split(/\r?\n/u);
  const artifactMarkerLine = artifactMarkerLines[0];
  if (artifactMarkerLine === undefined) {
    throw new Error('Agent terminal artifact marker identity is unavailable.');
  }
  const nextActionMarkerLine = nextActionMarkerLines[0];
  if (nextActionMarkerLine !== undefined && nextActionMarkerLine >= artifactMarkerLine) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_NEXT_ACTION_ORDER_INVALID',
      'Agent terminal next action must appear between the summary and artifact marker.',
    );
  }
  const summaryEndLine = nextActionMarkerLine ?? artifactMarkerLine;
  const summaryMarkdown = lines.slice(0, summaryEndLine).join('\n').trim();
  if (summaryMarkdown.length === 0) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_SUMMARY_MISSING',
      'Agent terminal artifact requires a conversational summary before the marker.',
    );
  }
  const recommendedNextActionMarkdown =
    nextActionMarkerLine === undefined
      ? undefined
      : lines
          .slice(nextActionMarkerLine + 1, artifactMarkerLine)
          .join('\n')
          .trim();
  if (recommendedNextActionMarkdown !== undefined && recommendedNextActionMarkdown.length === 0) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_NEXT_ACTION_MISSING',
      'Agent terminal next-action marker must be followed by one action.',
    );
  }
  const artifactMarkdown = lines
    .slice(artifactMarkerLine + 1)
    .join('\n')
    .trim();
  if (artifactMarkdown.length === 0) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_ARTIFACT_MISSING',
      'Agent terminal artifact marker must be followed by Markdown content.',
    );
  }
  const firstLine = artifactMarkdown.split(/\r?\n/u).find((line) => line.trim().length > 0);
  const heading =
    firstLine === undefined ? undefined : /^#\s+(.+?)\s*#*\s*$/u.exec(firstLine.trim());
  const title = heading?.[1]?.trim();
  if (title === undefined || title.length === 0) {
    throw new AgentTerminalMarkdownContractError(
      'AGENT_TERMINAL_ARTIFACT_TITLE_MISSING',
      'Agent terminal artifact must begin with one H1 title.',
    );
  }
  return {
    summaryMarkdown,
    ...(recommendedNextActionMarkdown === undefined ? {} : { recommendedNextActionMarkdown }),
    artifact: {
      kind: 'reviewable-markdown',
      title: title.slice(0, 160),
      profile: admission.profile,
      markdown: artifactMarkdown,
    },
  };
}

function findMarkerLines(markdown: string, marker: string): readonly number[] {
  const markerLines: number[] = [];
  let fence: { readonly character: '`' | '~'; readonly length: number } | undefined;
  const lines = markdown.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    const trimmedStart = line.trimStart();
    if (fence !== undefined) {
      const close = new RegExp(`^${fence.character}{${fence.length},}\\s*$`, 'u');
      if (close.test(trimmedStart)) fence = undefined;
      continue;
    }
    const opening = /^(`{3,}|~{3,})/u.exec(trimmedStart)?.[1];
    if (opening !== undefined) {
      fence = {
        character: opening[0] as '`' | '~',
        length: opening.length,
      };
      continue;
    }
    if (line.trim() === marker) markerLines.push(index);
  }
  return markerLines;
}
