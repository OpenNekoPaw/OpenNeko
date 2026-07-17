import type { SupportedLocale } from '@neko/shared/i18n';

export type LocalePreference = 'auto' | SupportedLocale;

export type LocaleResolutionDiagnostic =
  | Readonly<{
      readonly code: 'invalid-preference';
      readonly source: string;
      readonly value: unknown;
    }>
  | Readonly<{ readonly code: 'workspace-locale-forbidden'; readonly key: string }>;

export class LocaleResolutionError extends Error {
  public override readonly name = 'LocaleResolutionError';

  public constructor(public readonly diagnostic: LocaleResolutionDiagnostic) {
    super(diagnostic.code);
  }
}

export interface RawLocaleSource {
  readonly present: boolean;
  readonly value?: unknown;
}

export interface LocaleSourceSnapshot {
  readonly ui: Readonly<{
    readonly cli: RawLocaleSource;
    readonly environment: RawLocaleSource;
    readonly user: RawLocaleSource;
  }>;
  readonly prompt: Readonly<{
    readonly cli: RawLocaleSource;
    readonly environment: RawLocaleSource;
    readonly user: RawLocaleSource;
  }>;
  readonly workspace: Readonly<{
    readonly ui: RawLocaleSource;
    readonly prompt: RawLocaleSource;
  }>;
  readonly host: SupportedLocale;
}

export type HostLocaleSource =
  Readonly<{ kind: 'os-preferred'; locale: string }> | Readonly<{ kind: 'os-unavailable' }>;

export interface ResolvedInvocationLocales {
  readonly uiLocale: SupportedLocale;
  readonly promptLocale: SupportedLocale;
}

export function captureLocaleSourceSnapshot(input: {
  readonly cliUiLocale?: unknown;
  readonly cliPromptLocale?: unknown;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly userConfig?: unknown;
  readonly workspaceConfig?: unknown;
  readonly intlLocale?: string | undefined;
  readonly hostLocaleSource?: HostLocaleSource | undefined;
}): LocaleSourceSnapshot {
  return {
    ui: {
      cli: fromOptionalArgument(input.cliUiLocale),
      environment: fromEnvironment(input.environment, 'NEKO_UI_LOCALE'),
      user: fromObjectProperty(input.userConfig, 'ui_locale'),
    },
    prompt: {
      cli: fromOptionalArgument(input.cliPromptLocale),
      environment: fromEnvironment(input.environment, 'NEKO_PROMPT_LOCALE'),
      user: fromObjectProperty(input.userConfig, 'prompt_locale'),
    },
    workspace: {
      ui: fromObjectProperty(input.workspaceConfig, 'ui_locale'),
      prompt: fromObjectProperty(input.workspaceConfig, 'prompt_locale'),
    },
    host: detectHostLocale(input.environment, input.intlLocale, input.hostLocaleSource),
  };
}

export function resolveInvocationLocales(
  snapshot: LocaleSourceSnapshot,
): ResolvedInvocationLocales {
  rejectWorkspaceLocale('ui_locale', snapshot.workspace.ui);
  rejectWorkspaceLocale('prompt_locale', snapshot.workspace.prompt);

  const uiCli = validatePreference('--ui-locale', snapshot.ui.cli);
  const uiEnvironment = validatePreference('NEKO_UI_LOCALE', snapshot.ui.environment);
  const uiUser = validatePreference('ui_locale', snapshot.ui.user);
  const promptCli = validatePreference('--prompt-locale', snapshot.prompt.cli);
  const promptEnvironment = validatePreference('NEKO_PROMPT_LOCALE', snapshot.prompt.environment);
  const promptUser = validatePreference('prompt_locale', snapshot.prompt.user);

  const uiPreference = uiCli ?? uiEnvironment ?? uiUser ?? 'auto';
  const uiLocale = uiPreference === 'auto' ? snapshot.host : uiPreference;
  const promptPreference = promptCli ?? promptEnvironment ?? promptUser;
  const promptLocale =
    promptPreference === undefined || promptPreference === 'auto' ? uiLocale : promptPreference;

  return { uiLocale, promptLocale };
}

export function detectHostLocale(
  environment: Readonly<Record<string, string | undefined>>,
  intlLocale: string | undefined = Intl.DateTimeFormat().resolvedOptions().locale,
  hostLocaleSource?: HostLocaleSource,
): SupportedLocale {
  if (hostLocaleSource?.kind === 'os-unavailable') return 'en';
  if (hostLocaleSource?.kind === 'os-preferred') {
    return normalizeDetectedLocale(hostLocaleSource.locale);
  }

  const language = firstLanguageToken(
    environment['LC_ALL'] ??
      environment['LC_MESSAGES'] ??
      environment['LANGUAGE'] ??
      environment['LANG'] ??
      intlLocale ??
      '',
  );
  return normalizeDetectedLocale(language);
}

function fromOptionalArgument(value: unknown): RawLocaleSource {
  return value === undefined ? { present: false } : { present: true, value };
}

function fromEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): RawLocaleSource {
  return Object.prototype.hasOwnProperty.call(environment, key)
    ? { present: true, value: environment[key] }
    : { present: false };
}

function fromObjectProperty(value: unknown, key: string): RawLocaleSource {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Object.prototype.hasOwnProperty.call(value, key)
  ) {
    return { present: false };
  }
  return { present: true, value: Reflect.get(value, key) };
}

function validatePreference(label: string, source: RawLocaleSource): LocalePreference | undefined {
  if (!source.present) return undefined;
  if (source.value === 'auto' || source.value === 'en' || source.value === 'zh-cn') {
    return source.value;
  }
  throw new LocaleResolutionError({
    code: 'invalid-preference',
    source: label,
    value: source.value,
  });
}

function rejectWorkspaceLocale(key: string, source: RawLocaleSource): void {
  if (!source.present) return;
  throw new LocaleResolutionError({ code: 'workspace-locale-forbidden', key });
}

function normalizeDetectedLocale(value: string): SupportedLocale {
  const normalized = value.split('.')[0]?.split('@')[0]?.replaceAll('_', '-').toLowerCase() ?? '';
  if (normalized === 'c' || normalized === 'posix') return 'en';
  return normalized === 'zh' || normalized.startsWith('zh-') ? 'zh-cn' : 'en';
}

function firstLanguageToken(value: string): string {
  return value.split(':')[0] ?? '';
}
