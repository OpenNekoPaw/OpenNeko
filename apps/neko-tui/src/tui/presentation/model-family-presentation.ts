import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalDiagnostic } from './diagnostic';
import { projectAgentTerminalDiagnostic } from './diagnostic';
import type { AgentTerminalMessageKey } from './terminal-messages';

export type AgentTerminalMediaCategory = 'image' | 'video' | 'audio';
export type AgentTerminalModelSource = 'session-override' | 'config-default' | 'not-set';

export interface AgentTerminalModelOption {
  readonly id: string;
  readonly label: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly active: boolean;
}

export interface AgentTerminalCategoryModelStatus {
  readonly category: AgentTerminalMediaCategory;
  readonly currentModelId?: string;
  readonly source?: AgentTerminalModelSource;
  readonly options: readonly AgentTerminalModelOption[];
}

export interface AgentTerminalModelMenuItem {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly active: boolean;
}

export interface AgentTerminalModelMenuProjection {
  readonly title: string;
  readonly items: readonly AgentTerminalModelMenuItem[];
}

export type ModelCommandDiagnostic = AgentTerminalDiagnostic<
  'model.unknown' | 'model.selection-unavailable' | 'model.operation-failed',
  Readonly<{ readonly modelId?: string }>
>;

export type ModelCommandSemanticResult =
  | Readonly<{
      readonly kind: 'status';
      readonly currentModelId: string;
      readonly options: readonly AgentTerminalModelOption[];
      readonly media: readonly AgentTerminalCategoryModelStatus[];
      readonly perception: readonly AgentTerminalCategoryModelStatus[];
    }>
  | Readonly<{ readonly kind: 'selected'; readonly modelId: string }>
  | Readonly<{ readonly kind: 'menu'; readonly options: readonly AgentTerminalModelOption[] }>
  | Readonly<{ readonly kind: 'diagnostic'; readonly diagnostic: ModelCommandDiagnostic }>;

export type MediaCommandDiagnostic = AgentTerminalDiagnostic<
  | 'media.unknown'
  | 'media.category-unknown'
  | 'media.selection-unavailable'
  | 'media.reset-unavailable'
  | 'media.reset-failed'
  | 'media.operation-failed',
  Readonly<{ readonly category?: AgentTerminalMediaCategory; readonly modelId?: string }>
>;

export type MediaCommandSemanticResult =
  | Readonly<{
      readonly kind: 'status';
      readonly categories: readonly AgentTerminalCategoryModelStatus[];
      readonly scope: 'all' | 'category';
    }>
  | Readonly<{
      readonly kind: 'selected';
      readonly category: AgentTerminalMediaCategory;
      readonly modelId: string;
    }>
  | Readonly<{ readonly kind: 'disabled'; readonly category: AgentTerminalMediaCategory }>
  | Readonly<{ readonly kind: 'reset' }>
  | Readonly<{
      readonly kind: 'menu';
      readonly category: AgentTerminalMediaCategory;
      readonly options: readonly AgentTerminalModelOption[];
    }>
  | Readonly<{ readonly kind: 'diagnostic'; readonly diagnostic: MediaCommandDiagnostic }>;

export type PerceptionCommandDiagnostic = AgentTerminalDiagnostic<
  | 'perception.unknown'
  | 'perception.category-unknown'
  | 'perception.selection-unavailable'
  | 'perception.reset-unavailable'
  | 'perception.reset-failed'
  | 'perception.operation-failed',
  Readonly<{ readonly category?: AgentTerminalMediaCategory; readonly modelId?: string }>
>;

export type PerceptionCommandSemanticResult =
  | Readonly<{
      readonly kind: 'status';
      readonly categories: readonly AgentTerminalCategoryModelStatus[];
      readonly scope: 'all' | 'category';
    }>
  | Readonly<{
      readonly kind: 'selected';
      readonly category: AgentTerminalMediaCategory;
      readonly modelId: string;
    }>
  | Readonly<{ readonly kind: 'automatic'; readonly category: AgentTerminalMediaCategory }>
  | Readonly<{ readonly kind: 'reset' }>
  | Readonly<{
      readonly kind: 'menu';
      readonly category: AgentTerminalMediaCategory;
      readonly options: readonly AgentTerminalModelOption[];
    }>
  | Readonly<{ readonly kind: 'diagnostic'; readonly diagnostic: PerceptionCommandDiagnostic }>;

export type AgentTerminalCommandProjection =
  | Readonly<{ readonly kind: 'output'; readonly output: string }>
  | Readonly<{ readonly kind: 'error'; readonly error: string; readonly diagnosticCode: string }>
  | Readonly<{ readonly kind: 'model-menu'; readonly menu: AgentTerminalModelMenuProjection }>;

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentModelCommand(
  result: ModelCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'status':
      return {
        kind: 'output',
        output: [
          context.t('agent.terminal.model.status.header'),
          context.t('agent.terminal.model.status.current', { modelId: result.currentModelId }),
          context.t('agent.terminal.model.status.available'),
          ...presentOptions(result.options, context),
          '',
          ...presentMediaStatus(result.media, 'all', context),
          '',
          ...presentPerceptionStatus(result.perception, 'all', context),
          '',
          context.t('agent.terminal.model.status.usage.chat'),
          context.t('agent.terminal.model.status.usage.media'),
          context.t('agent.terminal.model.status.usage.perception'),
        ].join('\n'),
      };
    case 'selected':
      return {
        kind: 'output',
        output: context.t('agent.terminal.model.selected', { modelId: result.modelId }),
      };
    case 'menu':
      return {
        kind: 'model-menu',
        menu: {
          title: context.t('agent.terminal.model.menu.title'),
          items: result.options.map(toMenuItem),
        },
      };
    case 'diagnostic':
      return presentModelDiagnostic(result.diagnostic, context);
  }
}

export function presentMediaCommand(
  result: MediaCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'status':
      return {
        kind: 'output',
        output: presentMediaStatus(result.categories, result.scope, context).join('\n'),
      };
    case 'selected':
      return {
        kind: 'output',
        output: context.t('agent.terminal.media.selected', {
          category: presentCategory(result.category, context),
          modelId: result.modelId,
        }),
      };
    case 'disabled':
      return {
        kind: 'output',
        output: context.t('agent.terminal.media.disabled', {
          category: presentCategory(result.category, context),
        }),
      };
    case 'reset':
      return { kind: 'output', output: context.t('agent.terminal.media.reset') };
    case 'menu':
      return {
        kind: 'model-menu',
        menu: {
          title: context.t('agent.terminal.media.menu.title', {
            category: presentCategoryTitle(result.category, context),
          }),
          items: [
            ...result.options.map(toMenuItem),
            {
              id: '__none__',
              label: context.t('agent.terminal.media.menu.none.label'),
              description: context.t('agent.terminal.media.menu.none.description', {
                category: presentCategory(result.category, context),
              }),
              active: result.options.every((option) => !option.active),
            },
          ],
        },
      };
    case 'diagnostic':
      return presentMediaDiagnostic(result.diagnostic, context);
  }
}

export function presentPerceptionCommand(
  result: PerceptionCommandSemanticResult,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'status':
      return {
        kind: 'output',
        output: presentPerceptionStatus(result.categories, result.scope, context).join('\n'),
      };
    case 'selected':
      return {
        kind: 'output',
        output: context.t('agent.terminal.perception.selected', {
          category: presentCategory(result.category, context),
          modelId: result.modelId,
        }),
      };
    case 'automatic':
      return {
        kind: 'output',
        output: context.t('agent.terminal.perception.automatic', {
          category: presentCategory(result.category, context),
        }),
      };
    case 'reset':
      return { kind: 'output', output: context.t('agent.terminal.perception.reset') };
    case 'menu':
      return {
        kind: 'model-menu',
        menu: {
          title: context.t('agent.terminal.perception.menu.title', {
            category: presentCategoryTitle(result.category, context),
          }),
          items: [
            ...result.options.map(toMenuItem),
            {
              id: '__auto__',
              label: context.t('agent.terminal.perception.menu.auto.label'),
              description: context.t('agent.terminal.perception.menu.auto.description', {
                category: presentCategory(result.category, context),
              }),
              active: result.options.every((option) => !option.active),
            },
          ],
        },
      };
    case 'diagnostic':
      return presentPerceptionDiagnostic(result.diagnostic, context);
  }
}

function presentMediaStatus(
  categories: readonly AgentTerminalCategoryModelStatus[],
  scope: 'all' | 'category',
  context: PresentationContext,
): readonly string[] {
  const lines = [context.t('agent.terminal.media.status.header')];
  for (const status of categories) {
    lines.push(
      context.t('agent.terminal.media.status.category', {
        category: presentCategory(status.category, context),
        modelId: status.currentModelId ?? context.t('agent.terminal.value.model.none'),
        source: presentSource(status.source ?? 'not-set', context),
      }),
    );
    if (status.options.length > 0) {
      lines.push(
        context.t('agent.terminal.media.status.available', {
          category: presentCategory(status.category, context),
        }),
      );
      lines.push(...presentOptions(status.options, context));
    }
  }
  lines.push(
    '',
    context.t(
      scope === 'all'
        ? 'agent.terminal.media.status.usage.all'
        : 'agent.terminal.media.status.usage.category',
    ),
  );
  return lines;
}

function presentPerceptionStatus(
  categories: readonly AgentTerminalCategoryModelStatus[],
  scope: 'all' | 'category',
  context: PresentationContext,
): readonly string[] {
  const lines = [context.t('agent.terminal.perception.status.header')];
  for (const status of categories) {
    lines.push(
      context.t('agent.terminal.perception.status.category', {
        category: presentCategory(status.category, context),
        modelId: status.currentModelId ?? context.t('agent.terminal.value.model.auto'),
      }),
    );
    if (status.options.length > 0) {
      lines.push(
        context.t('agent.terminal.perception.status.available', {
          category: presentCategory(status.category, context),
        }),
      );
      lines.push(...presentOptions(status.options, context));
    }
  }
  lines.push(
    '',
    context.t(
      scope === 'all'
        ? 'agent.terminal.perception.status.usage.all'
        : 'agent.terminal.perception.status.usage.category',
    ),
  );
  return lines;
}

function presentOptions(
  options: readonly AgentTerminalModelOption[],
  context: PresentationContext,
): readonly string[] {
  return options.map((option) =>
    context.t(
      option.active
        ? 'agent.terminal.model.status.optionCurrent'
        : 'agent.terminal.model.status.option',
      { modelId: option.id, label: option.label },
    ),
  );
}

function toMenuItem(option: AgentTerminalModelOption): AgentTerminalModelMenuItem {
  return {
    id: option.id,
    label: option.label,
    description: `${option.providerId}/${option.modelId}`,
    active: option.active,
  };
}

function presentSource(source: AgentTerminalModelSource, context: PresentationContext): string {
  switch (source) {
    case 'session-override':
      return context.t('agent.terminal.value.modelSource.sessionOverride');
    case 'config-default':
      return context.t('agent.terminal.value.modelSource.configDefault');
    case 'not-set':
      return context.t('agent.terminal.value.modelSource.notSet');
  }
}

function presentCategoryTitle(
  category: AgentTerminalMediaCategory,
  context: PresentationContext,
): string {
  switch (category) {
    case 'image':
      return context.t('agent.terminal.value.mediaCategoryTitle.image');
    case 'video':
      return context.t('agent.terminal.value.mediaCategoryTitle.video');
    case 'audio':
      return context.t('agent.terminal.value.mediaCategoryTitle.audio');
  }
}

function presentCategory(
  category: AgentTerminalMediaCategory,
  context: PresentationContext,
): string {
  switch (category) {
    case 'image':
      return context.t('agent.terminal.value.sessionMode.image');
    case 'video':
      return context.t('agent.terminal.value.sessionMode.video');
    case 'audio':
      return context.t('agent.terminal.value.sessionMode.audio');
  }
}

function presentModelDiagnostic(
  diagnostic: ModelCommandDiagnostic,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  let message: string;
  switch (diagnostic.code) {
    case 'model.unknown':
      message = context.t('agent.terminal.diagnostic.model.unknown', {
        modelId: requireDiagnosticString(diagnostic, 'modelId'),
      });
      break;
    case 'model.selection-unavailable':
      message = context.t('agent.terminal.diagnostic.model.unavailable');
      break;
    case 'model.operation-failed':
      message = context.t('agent.terminal.diagnostic.model.operationFailed');
      break;
  }
  return diagnosticProjection(diagnostic, message);
}

function presentMediaDiagnostic(
  diagnostic: MediaCommandDiagnostic,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  let message: string;
  switch (diagnostic.code) {
    case 'media.unknown':
      message = context.t('agent.terminal.diagnostic.media.unknown', {
        category: presentCategory(requireDiagnosticCategory(diagnostic), context),
        modelId: requireDiagnosticString(diagnostic, 'modelId'),
      });
      break;
    case 'media.category-unknown':
      message = context.t('agent.terminal.diagnostic.media.categoryUnknown');
      break;
    case 'media.selection-unavailable':
      message = context.t('agent.terminal.diagnostic.media.unavailable');
      break;
    case 'media.reset-unavailable':
      message = context.t('agent.terminal.diagnostic.media.resetUnavailable');
      break;
    case 'media.reset-failed':
      message = context.t('agent.terminal.diagnostic.media.resetFailed');
      break;
    case 'media.operation-failed':
      message = context.t('agent.terminal.diagnostic.media.operationFailed', {
        category: presentCategory(requireDiagnosticCategory(diagnostic), context),
      });
      break;
  }
  return diagnosticProjection(diagnostic, message);
}

function presentPerceptionDiagnostic(
  diagnostic: PerceptionCommandDiagnostic,
  context: PresentationContext,
): AgentTerminalCommandProjection {
  let message: string;
  switch (diagnostic.code) {
    case 'perception.unknown':
      message = context.t('agent.terminal.diagnostic.perception.unknown', {
        category: presentCategory(requireDiagnosticCategory(diagnostic), context),
        modelId: requireDiagnosticString(diagnostic, 'modelId'),
      });
      break;
    case 'perception.category-unknown':
      message = context.t('agent.terminal.diagnostic.perception.categoryUnknown');
      break;
    case 'perception.selection-unavailable':
      message = context.t('agent.terminal.diagnostic.perception.unavailable');
      break;
    case 'perception.reset-unavailable':
      message = context.t('agent.terminal.diagnostic.perception.resetUnavailable');
      break;
    case 'perception.reset-failed':
      message = context.t('agent.terminal.diagnostic.perception.resetFailed');
      break;
    case 'perception.operation-failed':
      message = context.t('agent.terminal.diagnostic.perception.operationFailed', {
        category: presentCategory(requireDiagnosticCategory(diagnostic), context),
      });
      break;
  }
  return diagnosticProjection(diagnostic, message);
}

function diagnosticProjection(
  diagnostic: AgentTerminalDiagnostic<string, Readonly<Record<string, unknown>>>,
  message: string,
): AgentTerminalCommandProjection {
  const projection = projectAgentTerminalDiagnostic(
    diagnostic.code,
    message,
    diagnostic.externalDetail,
  );
  return { kind: 'error', error: projection.message, diagnosticCode: projection.code };
}

function requireDiagnosticString(
  diagnostic: AgentTerminalDiagnostic<string, Readonly<Record<string, unknown>>>,
  key: string,
): string {
  const value = diagnostic.data?.[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Diagnostic ${diagnostic.code} requires string data.${key}.`);
  }
  return value;
}

function requireDiagnosticCategory(
  diagnostic: AgentTerminalDiagnostic<string, Readonly<Record<string, unknown>>>,
): AgentTerminalMediaCategory {
  const value = diagnostic.data?.['category'];
  if (value === 'image' || value === 'video' || value === 'audio') return value;
  throw new Error(`Diagnostic ${diagnostic.code} requires a valid data.category.`);
}
