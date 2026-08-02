import {
  projectNekoMarkdownExtensions,
  type NekoMarkdownProjectOptions,
  type NekoMarkdownSemanticPromptSpan,
} from '@neko/markdown';
import type {
  MarkdownEditorProfile,
  MarkdownProjectionInput,
  MarkdownProjectionResult,
  MarkdownSemanticSpan,
  MarkdownUiDiagnostic,
} from './types';

export function projectMarkdownForUi({
  value,
  profile = 'plain-markdown',
  projectionOptions,
  semanticSpans = [],
  diagnostics = [],
}: MarkdownProjectionInput): MarkdownProjectionResult {
  const spanValidation = validateAndFilterSemanticSpans(value, semanticSpans);
  const options = createProjectionOptions(profile, projectionOptions, spanValidation.spans);
  const projection = projectNekoMarkdownExtensions(value, options);
  return {
    profile,
    projection,
    semanticSpans: spanValidation.spans,
    diagnostics: [
      ...projection.diagnostics.map((diagnostic): MarkdownUiDiagnostic => ({
        ...diagnostic,
        message: formatMarkdownUiDiagnostic(diagnostic),
        source: 'projection',
      })),
      ...spanValidation.diagnostics,
      ...diagnostics,
    ],
  };
}

export function createProjectionOptions(
  profile: MarkdownEditorProfile,
  projectionOptions: NekoMarkdownProjectOptions | undefined,
  semanticSpans: readonly MarkdownSemanticSpan[],
): NekoMarkdownProjectOptions {
  const resourceReferences =
    projectionOptions?.resourceReferences ??
    (profile === 'resource-markdown' || profile === 'semantic-prompt' ? 'enabled' : 'disabled');

  return {
    ...projectionOptions,
    resourceReferences,
    promptSpans:
      projectionOptions?.promptSpans ??
      semanticSpans.map((span): NekoMarkdownSemanticPromptSpan => ({
        kind: span.kind,
        range: span.range,
        ...(span.fieldId ? { fieldId: span.fieldId } : {}),
        ...(span.label ? { label: span.label } : {}),
        ...(span.tone ? { tone: span.tone } : {}),
        ...(span.tooltip ? { tooltip: span.tooltip } : {}),
      })),
  };
}

export function validateSemanticSpans(
  value: string,
  semanticSpans: readonly MarkdownSemanticSpan[],
): readonly MarkdownUiDiagnostic[] {
  return validateAndFilterSemanticSpans(value, semanticSpans).diagnostics;
}

function validateAndFilterSemanticSpans(
  value: string,
  semanticSpans: readonly MarkdownSemanticSpan[],
): {
  readonly spans: readonly MarkdownSemanticSpan[];
  readonly diagnostics: readonly MarkdownUiDiagnostic[];
} {
  const diagnostics: MarkdownUiDiagnostic[] = [];
  const inBoundsSpans: MarkdownSemanticSpan[] = [];

  for (const span of semanticSpans) {
    if (!Number.isInteger(span.range.startOffset) || !Number.isInteger(span.range.endOffset)) {
      diagnostics.push(
        createEditorDiagnostic(
          'markdown-ui-invalid-span-range',
          'Semantic span range must use integer offsets.',
          normalizeInvalidRange(value),
        ),
      );
      continue;
    }

    if (
      span.range.startOffset < 0 ||
      span.range.endOffset <= span.range.startOffset ||
      span.range.endOffset > value.length
    ) {
      diagnostics.push(
        createEditorDiagnostic(
          'markdown-ui-invalid-span-range',
          'Semantic span range is outside the current text.',
          normalizeInvalidRange(value),
        ),
      );
      continue;
    }

    inBoundsSpans.push(span);
  }

  const spans: MarkdownSemanticSpan[] = [];
  let cursor = 0;
  for (const span of [...inBoundsSpans].sort(
    (left, right) => left.range.startOffset - right.range.startOffset,
  )) {
    if (span.range.startOffset < cursor) {
      diagnostics.push(
        createEditorDiagnostic(
          'markdown-ui-overlapping-span-range',
          'Semantic span ranges must not overlap.',
          span.range,
        ),
      );
      continue;
    }
    spans.push(span);
    cursor = span.range.endOffset;
  }

  return { spans, diagnostics };
}

function createEditorDiagnostic(
  code: string,
  message: string,
  range: MarkdownUiDiagnostic['range'],
): MarkdownUiDiagnostic {
  return {
    severity: 'error',
    code,
    phase: 'project',
    parameters: {},
    message,
    ...(range ? { range } : {}),
    source: 'editor',
  };
}

function normalizeInvalidRange(value: string): { startOffset: number; endOffset: number } {
  return { startOffset: 0, endOffset: Math.min(value.length, 1) };
}

function formatMarkdownUiDiagnostic(
  diagnostic: import('@neko/markdown').NekoMarkdownDiagnostic,
): string {
  const token = String(diagnostic.parameters['token'] ?? '');
  switch (diagnostic.code) {
    case 'MD_RESOURCE_REFERENCE_UNSUPPORTED':
      return 'Markdown resource references are unsupported in this context.';
    case 'MD_RESOURCE_REFERENCE_AMBIGUOUS':
      return `Markdown resource reference "${token}" is ambiguous.`;
    case 'MD_RESOURCE_REFERENCE_MISSING':
      return `Markdown resource reference "${token}" could not be resolved.`;
    case 'MD_MENTION_AMBIGUOUS':
      return `Markdown mention "${token}" is ambiguous.`;
    case 'MD_MENTION_MISSING':
      return `Markdown mention "${token}" could not be resolved.`;
    case 'MD_RAW_HTML_PRESERVED':
      return 'Raw HTML is preserved as inert Markdown content.';
    case 'MD_TABLE_ROW_WIDTH_MISMATCH':
      return 'Markdown table rows have different cell counts.';
    case 'MD_UNSAFE_DESTINATION':
      return 'Markdown contains a destination that the host must not activate.';
    default:
      return diagnostic.externalDetail?.detail ?? diagnostic.code;
  }
}
