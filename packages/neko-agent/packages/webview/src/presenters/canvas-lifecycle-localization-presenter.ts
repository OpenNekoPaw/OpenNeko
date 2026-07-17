import type {
  AgentCapabilityAction,
  AgentCapabilityArtifactRef,
  AgentCapabilityInvocationResult,
} from '@neko/shared';

export type ChatTranslation = (key: string, params?: Record<string, string | number>) => string;

export function formatCanvasLifecycleStatus(
  t: ChatTranslation,
  status: AgentCapabilityInvocationResult['status'],
): string {
  switch (status) {
    case 'described':
      return t('chat.canvasLifecycle.status.described');
    case 'validated':
      return t('chat.canvasLifecycle.status.validated');
    case 'needs-review':
      return t('chat.canvasLifecycle.status.needs-review');
    case 'waiting-approval':
      return t('chat.canvasLifecycle.status.waiting-approval');
    case 'applied':
      return t('chat.canvasLifecycle.status.applied');
    case 'executed':
      return t('chat.canvasLifecycle.status.executed');
    case 'blocked':
      return t('chat.canvasLifecycle.status.blocked');
  }
}

export function formatCanvasLifecycleDiagnosticSeverity(
  t: ChatTranslation,
  severity: AgentCapabilityInvocationResult['diagnostics'][number]['severity'],
): string {
  switch (severity) {
    case 'info':
      return t('chat.canvasLifecycle.diagnosticSeverity.info');
    case 'warning':
      return t('chat.canvasLifecycle.diagnosticSeverity.warning');
    case 'error':
      return t('chat.canvasLifecycle.diagnosticSeverity.error');
  }
}

export function formatCanvasLifecycleDiagnosticMessage(
  t: ChatTranslation,
  diagnostic: AgentCapabilityInvocationResult['diagnostics'][number],
): string {
  const key = CANVAS_LIFECYCLE_DIAGNOSTIC_MESSAGE_KEY_BY_CODE[diagnostic.code];
  if (!key) {
    return t('chat.canvasLifecycle.diagnostic.unlocalized', { code: diagnostic.code });
  }
  return t(key, {
    token: diagnostic.token ?? '',
    field: diagnostic.fieldKey ?? '',
    line: diagnostic.line ?? '',
    column: diagnostic.column ?? '',
  });
}

export function formatCanvasLifecycleActionLabel(
  t: ChatTranslation,
  action: Pick<AgentCapabilityAction, 'actionId'>,
): string {
  switch (action.actionId) {
    case 'create-storyboard-nodes':
      return t('chat.canvasLifecycle.action.createStoryboardNodes');
    default:
      return action.actionId;
  }
}

export function formatCanvasLifecycleArtifactRef(ref: AgentCapabilityArtifactRef): string {
  return [ref.packageId, ref.kind, ref.id].filter(Boolean).join(':');
}

const CANVAS_LIFECYCLE_DIAGNOSTIC_MESSAGE_KEY_BY_CODE: Record<string, string> = {
  'canvas-creative-profile-unsupported':
    'chat.canvasLifecycle.diagnostic.canvasCreativeProfileUnsupported',
  'canvas-markdown-ambiguous-resource-token':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownAmbiguousResourceToken',
  'canvas-markdown-attach-resource-missing-stable-ref':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownAttachResourceMissingStableRef',
  'canvas-markdown-attach-resource-missing-target-node':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownAttachResourceMissingTargetNode',
  'canvas-markdown-capability-invocation-failed':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownCapabilityInvocationFailed',
  'canvas-markdown-invalid-approval':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidApproval',
  'canvas-markdown-invalid-document-resource-ref':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidDocumentResourceRef',
  'canvas-markdown-invalid-input': 'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidInput',
  'canvas-markdown-invalid-mode': 'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidMode',
  'canvas-markdown-invalid-resource':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidResource',
  'canvas-markdown-invalid-resource-ref':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidResourceRef',
  'canvas-markdown-invalid-resources':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidResources',
  'canvas-markdown-invalid-string-field':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidStringField',
  'canvas-markdown-invalid-target': 'chat.canvasLifecycle.diagnostic.canvasMarkdownInvalidTarget',
  'canvas-markdown-missing-markdown':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownMissingMarkdown',
  'canvas-markdown-missing-resource-token':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownMissingResourceToken',
  'canvas-markdown-missing-stable-resource':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownMissingStableResource',
  'canvas-markdown-operation-profile-mismatch':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownOperationProfileMismatch',
  'canvas-markdown-operation-required-field-missing':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownOperationRequiredFieldMissing',
  'canvas-markdown-runtime-resource-path':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownRuntimeResourcePath',
  'canvas-markdown-runtime-resource-token':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownRuntimeResourceToken',
  'canvas-storyboard-profile-create-approval-required':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownStoryboardCreateApprovalRequired',
  'canvas-storyboard-profile-create-not-confirmed':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownStoryboardCreateNotConfirmed',
  'canvas-storyboard-profile-next-action-missing':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownStoryboardNextActionMissing',
  'canvas-storyboard-profile-no-production-rows':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownStoryboardNoProductionRows',
  'canvas-storyboard-profile-visual-column-required':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownStoryboardVisualColumnRequired',
  'canvas-storyboard-profile-visual-or-prompt-missing':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownStoryboardVisualOrPromptMissing',
  'canvas-markdown-table-empty': 'chat.canvasLifecycle.diagnostic.canvasMarkdownTableEmpty',
  'canvas-markdown-table-missing': 'chat.canvasLifecycle.diagnostic.canvasMarkdownTableMissing',
  'canvas-markdown-table-profile-unknown-column':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownTableProfileUnknownColumn',
  'canvas-markdown-table-row-width-mismatch':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownTableRowWidthMismatch',
  'canvas-markdown-unknown-capability':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownUnknownCapability',
  'canvas-markdown-unsupported-ingest-intent':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownUnsupportedIngestIntent',
  'canvas-markdown-unsupported-operation-hint':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownUnsupportedOperationHint',
  'canvas-markdown-unsupported-source-format':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownUnsupportedSourceFormat',
  'canvas-markdown-unsupported-table-profile':
    'chat.canvasLifecycle.diagnostic.canvasMarkdownUnsupportedTableProfile',
};
