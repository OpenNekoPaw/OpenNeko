import type {
  TuiArtifactMediaKind,
  TuiArtifactReference,
} from '../core/artifact-reference-formatter';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export type ArtifactCommandSemanticResult =
  | Readonly<{ readonly kind: 'list'; readonly references: readonly TuiArtifactReference[] }>
  | Readonly<{ readonly kind: 'reference'; readonly reference: TuiArtifactReference }>
  | Readonly<{ readonly kind: 'opened'; readonly artifactId: string }>
  | Readonly<{ readonly kind: 'sent'; readonly artifactId: string; readonly target: string }>
  | Readonly<{
      readonly kind: 'diagnostic';
      readonly code:
        | 'unavailable'
        | 'list-unavailable'
        | 'show-usage'
        | 'show-unavailable'
        | 'unknown-reference'
        | 'open-usage'
        | 'open-unavailable'
        | 'send-usage'
        | 'send-unavailable'
        | 'unknown-command';
      readonly artifactId?: string;
      readonly command?: string;
    }>;

type Context = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentArtifactCommand(
  result: ArtifactCommandSemanticResult,
  context: Context,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'list':
      return { kind: 'output', output: presentList(result.references, context) };
    case 'reference':
      return { kind: 'output', output: presentArtifactReference(result.reference, context) };
    case 'opened':
      return {
        kind: 'output',
        output: context.t('agent.terminal.artifact.opened', { artifactId: result.artifactId }),
      };
    case 'sent':
      return {
        kind: 'output',
        output: context.t('agent.terminal.artifact.sent', {
          artifactId: result.artifactId,
          target: result.target,
        }),
      };
    case 'diagnostic':
      return presentDiagnostic(result, context);
  }
}

function presentList(references: readonly TuiArtifactReference[], context: Context): string {
  if (references.length === 0) return context.t('agent.terminal.artifact.list.empty');
  return references
    .map((reference) => {
      const id = reference.assetId ?? reference.artifactId ?? reference.ref ?? reference.id;
      const details = [
        reference.path,
        reference.dimensions,
        reference.duration,
        reference.probe,
      ].filter((value): value is string => Boolean(value));
      return details.length === 0
        ? context.t('agent.terminal.artifact.list.row', { id, kind: reference.kind })
        : context.t('agent.terminal.artifact.list.rowWithDetails', {
            id,
            kind: reference.kind,
            details: details.join('  '),
          });
    })
    .join('\n');
}

export function presentArtifactReference(
  reference: TuiArtifactReference,
  context: Context,
): string {
  const lines = [context.t(kindTitleKey(reference.kind))];
  const fields: readonly [AgentTerminalMessageKey, string | undefined][] = [
    ['agent.terminal.artifact.field.ref', reference.ref],
    ['agent.terminal.artifact.field.asset', reference.assetId],
    ['agent.terminal.artifact.field.artifact', reference.artifactId],
    ['agent.terminal.artifact.field.task', reference.taskId],
    ['agent.terminal.artifact.field.tool', reference.toolCallId],
    ['agent.terminal.artifact.field.file', reference.path],
    ['agent.terminal.artifact.field.size', reference.dimensions],
    ['agent.terminal.artifact.field.duration', reference.duration],
    ['agent.terminal.artifact.field.probe', reference.probe],
  ];
  for (const [key, value] of fields) if (value !== undefined) lines.push(context.t(key, { value }));
  lines.push(
    ...reference.diagnostics.map((detail) =>
      context.t('agent.terminal.artifact.externalDiagnostic', { detail }),
    ),
  );
  if (reference.commands.length > 0) {
    lines.push(context.t('agent.terminal.artifact.commands.header'));
    lines.push(
      ...reference.commands.map((command) =>
        context.t('agent.terminal.artifact.commands.row', { command }),
      ),
    );
  }
  return lines.join('\n');
}

function kindTitleKey(kind: TuiArtifactMediaKind): AgentTerminalMessageKey {
  return `agent.terminal.artifact.kind.${kind}`;
}

function presentDiagnostic(
  result: Extract<ArtifactCommandSemanticResult, { readonly kind: 'diagnostic' }>,
  context: Context,
): AgentTerminalCommandProjection {
  const diagnosticCode = `artifact.${result.code}`;
  if (result.code === 'unknown-reference') {
    return {
      kind: 'error',
      diagnosticCode,
      error: context.t('agent.terminal.diagnostic.artifact.unknown-reference', {
        artifactId: required(result.artifactId, result.code),
      }),
    };
  }
  if (result.code === 'unknown-command') {
    return {
      kind: 'error',
      diagnosticCode,
      error: context.t('agent.terminal.diagnostic.artifact.unknown-command', {
        command: required(result.command, result.code),
      }),
    };
  }
  return {
    kind: 'error',
    diagnosticCode,
    error: context.t(`agent.terminal.diagnostic.artifact.${result.code}`),
  };
}

function required(value: string | undefined, code: string): string {
  if (value === undefined)
    throw new Error(`Missing semantic value for artifact diagnostic: ${code}`);
  return value;
}
