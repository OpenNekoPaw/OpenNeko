import { spawnSync } from 'node:child_process';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import {
  getUserConfigPath,
  readUserConfigDocumentResult,
  readWorkspaceConfigDocumentResult,
  type ConfigDocumentReadResult,
} from '@neko/shared/config/config-reader';
import { createStrictTranslator, type SupportedLocale } from '@neko/shared/i18n';
import {
  captureLocaleSourceSnapshot,
  LocaleResolutionError,
  resolveInvocationLocales,
  type HostLocaleSource,
  type ResolvedInvocationLocales,
} from './locale-bootstrap';
import {
  createAgentTerminalPresentationContext,
  type AgentTerminalPresentationContext,
} from '../presentation/context';
import { createAgentTerminalFormatters } from '../presentation/formatters';
import {
  presentConfigLoadDiagnostic,
  presentLocaleResolutionDiagnostic,
} from '../presentation/cli-process-presentation';
import {
  CLI_TERMINAL_MESSAGE_SOURCE,
  type AgentTerminalMessageKey,
} from '../presentation/terminal-messages';

type ConfigDocumentReadFailure = Exclude<
  ConfigDocumentReadResult,
  { readonly status: 'ok' | 'missing' }
>;

export interface AgentTerminalInvocationContext extends ResolvedInvocationLocales {
  readonly presentation: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  readonly userConfigPath: string;
}

export function createNodeTerminalInvocationContext(input: {
  readonly workDir: string;
  readonly cliUiLocale?: unknown;
  readonly cliPromptLocale?: unknown;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly intlLocale?: string;
  readonly timeZone?: string;
  readonly platform?: typeof process.platform;
  readonly systemLocaleReader?: () => string | undefined;
}): AgentTerminalInvocationContext {
  const environment = input.environment ?? process.env;
  const hostLocaleSource = captureHostLocaleSource(
    input.platform ?? process.platform,
    input.systemLocaleReader ?? readMacOSPreferredLanguage,
  );
  const timeZone = input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userResult = readUserConfigDocumentResult();
  const workspaceResult = readWorkspaceConfigDocumentResult(input.workDir);
  const snapshot = captureLocaleSourceSnapshot({
    cliUiLocale: input.cliUiLocale,
    cliPromptLocale: input.cliPromptLocale,
    environment,
    userConfig: readDocument(userResult),
    workspaceConfig: readDocument(workspaceResult),
    intlLocale: input.intlLocale,
    hostLocaleSource,
  });
  const configFailure = firstConfigFailure(userResult, workspaceResult);
  if (configFailure !== undefined) {
    throw new Error(
      presentConfigLoadDiagnostic(
        {
          code: 'platform-config-unavailable',
          configCode: configFailure.diagnostic.code,
          filePath: configFailure.filePath,
        },
        createPresentation(snapshot.host, timeZone),
      ),
    );
  }
  let locales: ResolvedInvocationLocales;
  try {
    locales = resolveInvocationLocales(snapshot);
  } catch (error) {
    if (!(error instanceof LocaleResolutionError)) throw error;
    const diagnosticLocale = selectBootstrapUiLocale(snapshot);
    throw new Error(
      presentLocaleResolutionDiagnostic(
        error.diagnostic,
        createPresentation(diagnosticLocale, timeZone),
      ),
    );
  }
  const presentation = createPresentation(locales.uiLocale, timeZone);

  return Object.freeze({
    ...locales,
    presentation,
    userConfigPath: getUserConfigPath(),
  });
}

function createPresentation(
  locale: SupportedLocale,
  timeZone: string,
): AgentTerminalPresentationContext<AgentTerminalMessageKey> {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: createAgentTerminalFormatters({ locale, timeZone }),
  });
}

function selectBootstrapUiLocale(
  snapshot: ReturnType<typeof captureLocaleSourceSnapshot>,
): SupportedLocale {
  for (const source of [snapshot.ui.cli, snapshot.ui.environment, snapshot.ui.user]) {
    if (!source.present) continue;
    if (source.value === 'en' || source.value === 'zh-cn') return source.value;
    if (source.value === 'auto') return snapshot.host;
    return snapshot.host;
  }
  return snapshot.host;
}

function captureHostLocaleSource(
  platform: typeof process.platform,
  reader: () => string | undefined,
): HostLocaleSource | undefined {
  if (platform !== 'darwin') return undefined;
  try {
    const locale = reader();
    return locale === undefined || locale.length === 0
      ? { kind: 'os-unavailable' }
      : { kind: 'os-preferred', locale };
  } catch {
    return { kind: 'os-unavailable' };
  }
}

function readMacOSPreferredLanguage(): string | undefined {
  const result = spawnSync('/usr/bin/defaults', ['read', '-g', 'AppleLanguages'], {
    encoding: 'utf8',
    shell: false,
  });
  if (result.error !== undefined || result.status !== 0) return undefined;
  return parseMacOSPreferredLanguage(result.stdout);
}

export function parseMacOSPreferredLanguage(output: string): string | undefined {
  const quoted = /"([^"]+)"/.exec(output)?.[1];
  if (quoted !== undefined) return quoted;
  const scalar = output.trim();
  return /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*$/.test(scalar) ? scalar : undefined;
}

function readDocument(result: ConfigDocumentReadResult): unknown {
  return result.status === 'ok' ? result.document : undefined;
}

function firstConfigFailure(
  ...results: readonly ConfigDocumentReadResult[]
): ConfigDocumentReadFailure | undefined {
  return results.find(
    (result): result is ConfigDocumentReadFailure =>
      result.status !== 'ok' && result.status !== 'missing',
  );
}

export function createNodeTerminalInvocationContextFromArgv(
  argv: readonly string[],
  input: {
    readonly environment?: Readonly<Record<string, string | undefined>>;
    readonly intlLocale?: string;
    readonly timeZone?: string;
    readonly defaultWorkDir?: string;
    readonly platform?: typeof process.platform;
    readonly systemLocaleReader?: () => string | undefined;
  } = {},
): AgentTerminalInvocationContext {
  const sources = readCanonicalInvocationOptions(argv);
  return createNodeTerminalInvocationContext({
    workDir: sources.workDir ?? input.defaultWorkDir ?? process.cwd(),
    cliUiLocale: sources.uiLocale,
    cliPromptLocale: sources.promptLocale,
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.intlLocale ? { intlLocale: input.intlLocale } : {}),
    ...(input.timeZone ? { timeZone: input.timeZone } : {}),
    ...(input.platform ? { platform: input.platform } : {}),
    ...(input.systemLocaleReader ? { systemLocaleReader: input.systemLocaleReader } : {}),
  });
}

interface CanonicalInvocationOptions {
  readonly workDir?: string;
  readonly uiLocale?: string;
  readonly promptLocale?: string;
}

function readCanonicalInvocationOptions(argv: readonly string[]): CanonicalInvocationOptions {
  let workDir: string | undefined;
  let uiLocale: string | undefined;
  let promptLocale: string | undefined;
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    const inline = readInlineOption(token);
    if (inline) {
      if (isWorkDirFlag(inline.flag)) workDir = inline.value;
      if (inline.flag === '--ui-locale') uiLocale = inline.value;
      if (inline.flag === '--prompt-locale') promptLocale = inline.value;
      continue;
    }
    if (isWorkDirFlag(token) || token === '--ui-locale' || token === '--prompt-locale') {
      const value = argv[index + 1];
      if (value === undefined) continue;
      if (isWorkDirFlag(token)) workDir = value;
      if (token === '--ui-locale') uiLocale = value;
      if (token === '--prompt-locale') promptLocale = value;
      index += 1;
    }
  }
  return {
    ...(workDir ? { workDir } : {}),
    ...(uiLocale ? { uiLocale } : {}),
    ...(promptLocale ? { promptLocale } : {}),
  };
}

function readInlineOption(
  token: string,
): { readonly flag: string; readonly value: string } | undefined {
  const separator = token.indexOf('=');
  if (separator <= 0) return undefined;
  const flag = token.slice(0, separator);
  const value = token.slice(separator + 1);
  return value.length > 0 ? { flag, value } : undefined;
}

function isWorkDirFlag(value: string): boolean {
  return value === '-C' || value === '--cd' || value === '--cwd' || value === '--work-dir';
}
