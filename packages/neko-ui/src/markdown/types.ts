import type {
  NekoMarkdownDiagnostic,
  NekoMarkdownExtensionProjection,
  NekoMarkdownProjectOptions,
  NekoMarkdownReferenceStatus,
  NekoMarkdownSourceRange,
} from '@neko/markdown';
import type React from 'react';

export type MarkdownEditorProfile = 'plain-markdown' | 'resource-markdown' | 'semantic-prompt';

export type MarkdownSourceRange = NekoMarkdownSourceRange;

export interface MarkdownSemanticSpan {
  readonly id?: string;
  readonly kind: string;
  readonly range: MarkdownSourceRange;
  readonly fieldId?: string;
  readonly label?: string;
  readonly tone?: string;
  readonly tooltip?: string;
}

export type MarkdownRenderableTokenKind =
  | 'commonmark-image'
  | 'resource-reference'
  | 'mention'
  | 'semantic-span'
  | 'strong'
  | 'emphasis'
  | 'code';

export interface MarkdownRenderableToken {
  readonly kind: MarkdownRenderableTokenKind;
  readonly start: number;
  readonly end: number;
  readonly raw: string;
  readonly display: string;
  readonly title?: string;
  readonly embed?: boolean;
  readonly status?: NekoMarkdownReferenceStatus;
  readonly span?: MarkdownSemanticSpan;
}

export type MarkdownDiagnosticSource = 'projection' | 'caller' | 'editor';

export interface MarkdownUiDiagnostic extends NekoMarkdownDiagnostic {
  /** Host-owned localized or display-ready message. */
  readonly message: string;
  readonly source?: MarkdownDiagnosticSource;
}

export interface MarkdownProjectionInput {
  readonly value: string;
  readonly profile?: MarkdownEditorProfile;
  readonly projectionOptions?: NekoMarkdownProjectOptions;
  readonly semanticSpans?: readonly MarkdownSemanticSpan[];
  readonly diagnostics?: readonly MarkdownUiDiagnostic[];
}

export interface MarkdownProjectionResult {
  readonly profile: MarkdownEditorProfile;
  readonly projection: NekoMarkdownExtensionProjection;
  readonly semanticSpans: readonly MarkdownSemanticSpan[];
  readonly diagnostics: readonly MarkdownUiDiagnostic[];
}

export interface MarkdownTokenRenderContext {
  readonly token: MarkdownRenderableToken;
  readonly key: string;
}

export type MarkdownTokenRenderer = (context: MarkdownTokenRenderContext) => React.ReactNode;

export interface MarkdownCompletionContext<TContext = unknown> {
  readonly value: string;
  readonly cursor: number;
  readonly profile: MarkdownEditorProfile;
  readonly projection: NekoMarkdownExtensionProjection;
  readonly triggerCharacter?: string;
  readonly callerContext?: TContext;
}

export interface MarkdownCompletionEdit {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export interface MarkdownCompletionItem {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly kind?: string;
  readonly edit: MarkdownCompletionEdit;
}

export interface MarkdownCompletionProvider<TContext = unknown> {
  readonly id: string;
  readonly triggerCharacters: readonly string[];
  provideCompletions(
    context: MarkdownCompletionContext<TContext>,
  ): readonly MarkdownCompletionItem[];
}

export interface MarkdownCompletionState<TContext = unknown> {
  readonly context: MarkdownCompletionContext<TContext>;
  readonly items: readonly MarkdownCompletionItem[];
}
