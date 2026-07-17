/**
 * CLI Entry Point
 *
 * Parses command-line arguments with Commander,
 * loads configuration, and renders the Ink application.
 *
 * Commands:
 * - (default) interactive mode → full TUI
 * - config                    → config management
 */

import React from 'react';
import { render } from 'ink';
import { Command } from 'commander';
import * as nodeOs from 'node:os';
import { join } from 'node:path';
import { NodePiConversationAuthority } from '@neko/agent/pi';
import {
  CliConfigLoadError,
  loadConfig,
  validateConfig,
  listProviders,
  getProviderModels,
  loadDirectMediaCommandConfig,
} from './core/config';
import type { CLIConfig } from './core/types';
import { CliWorkDirError, resolveCliWorkDir } from './core/cli-workdir';
import { joinPromptParts, resolveDefaultCliInvocation } from './core/cli-invocation';
import {
  assertCanonicalTuiConversationId,
  isCanonicalTuiConversationId,
  TuiConversationIdError,
} from './core/tui-conversation-id';
import {
  createNodeTerminalInvocationContextFromArgv,
  type AgentTerminalInvocationContext,
} from './core/node-locale-bootstrap';
import { App } from './components/App';
import { detectCapabilities } from './utils/terminal';
import { TuiDebugAutomationSessionManager } from './core/debug-automation/session-manager';
import { runTuiDebugAutomationJsonLineServer } from './core/debug-automation/stdio';
import { createTuiLocalMetadataBinding } from './host/tui-local-metadata-binding';
import {
  formatLocalMetadataUserDiagnostic,
  projectLocalMetadataUserDiagnostic,
} from '@neko/shared';
import chalk from 'chalk';
import { presentConfigCommand } from './presentation/config-history-presentation';
import { presentTuiConversationIdDiagnostic } from './presentation/conversation-presentation';
import {
  configureLocalizedCommander,
  LocalizedCliCommand,
  presentCliProcessDiagnostic,
  presentCliWorkDirDiagnostic,
  presentConfigLoadDiagnostic,
  presentConfigValidation,
} from './presentation/cli-process-presentation';
import {
  DirectMediaCommandError,
  executeDirectMediaCommand,
  type DirectMediaKind,
} from './core/direct-media-command';
import { createDirectMediaRuntime } from './core/direct-media-runtime';
import {
  presentDirectMediaCommandError,
  presentDirectMediaCommandResult,
} from './presentation/direct-media-command-presentation';

export type CliCommandRuntimeClass = 'interactive-tui' | 'direct-media' | 'utility';

export function classifyCliCommandRuntime(commandName: string | undefined): CliCommandRuntimeClass {
  switch (commandName) {
    case undefined:
    case 'interactive':
    case 'resume':
      return 'interactive-tui';
    case 'image':
    case 'video':
    case 'audio':
      return 'direct-media';
    case 'completion':
    case 'config':
    case 'debug':
      return 'utility';
    default:
      throw new Error(`Unknown CLI command runtime class: ${commandName}`);
  }
}

function addWorkDirOptions(command: Command, terminal: AgentTerminalInvocationContext): Command {
  const { t } = terminal.presentation;
  return command
    .option('-C, --cd <dir>', t('agent.terminal.commander.option.workDir'))
    .option('--cwd <dir>', t('agent.terminal.commander.option.workDir'))
    .option('--work-dir <dir>', t('agent.terminal.commander.option.workDir'));
}

function addInteractiveOptions(
  command: Command,
  terminal: AgentTerminalInvocationContext,
): Command {
  const { t } = terminal.presentation;
  return command
    .option('-p, --provider <provider>', t('agent.terminal.commander.option.provider'))
    .option('-m, --model <model>', t('agent.terminal.commander.option.model'))
    .option('-k, --api-key <key>', t('agent.terminal.commander.option.apiKey'))
    .option('-v, --verbose', t('agent.terminal.commander.option.verbose'));
}

function addLocaleOptions(command: Command, terminal: AgentTerminalInvocationContext): Command {
  const { t } = terminal.presentation;
  return command
    .option('--ui-locale <preference>', t('agent.terminal.commander.option.uiLocale'))
    .option('--prompt-locale <preference>', t('agent.terminal.commander.option.promptLocale'));
}

function addResumeOption(command: Command, terminal: AgentTerminalInvocationContext): Command {
  return command.option(
    '-r, --resume [id]',
    terminal.presentation.t('agent.terminal.commander.option.resume'),
  );
}

function withGlobalOptions(
  program: Command,
  opts: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...program.opts(),
    ...opts,
  };
}

export interface CliProgramDependencies {
  readonly createDirectMediaRuntime?: typeof createDirectMediaRuntime;
}

export function createCliProgram(
  terminal: AgentTerminalInvocationContext,
  dependencies: CliProgramDependencies = {},
): Command {
  const { t } = terminal.presentation;
  const program = configureLocalizedCommander(
    new LocalizedCliCommand(terminal.presentation),
    terminal.presentation,
  );

  addResumeOption(
    addLocaleOptions(
      addInteractiveOptions(addWorkDirOptions(program, terminal), terminal),
      terminal,
    ),
    terminal,
  );
  program
    .name('neko')
    .usage('[options] [prompt...]\n       neko [options] <command> [args]')
    .description(t('agent.terminal.commander.program.description'))
    .version('0.0.1', '-V, --version', t('agent.terminal.commander.versionOption'))
    .argument('[prompt...]', t('agent.terminal.commander.argument.initialPrompt'))
    .action(async (promptParts: string[] | undefined, opts: Record<string, unknown>) => {
      await runCliAction(() => handleDefault(promptParts ?? [], opts, program, terminal), terminal);
    });

  addResumeOption(
    addLocaleOptions(
      addInteractiveOptions(
        addWorkDirOptions(
          program
            .command('interactive')
            .alias('i')
            .description(t('agent.terminal.commander.command.interactive'))
            .argument('[workDir]', t('agent.terminal.commander.argument.workDir'))
            .argument('[prompt...]', t('agent.terminal.commander.argument.startupPrompt')),
          terminal,
        ),
        terminal,
      ),
      terminal,
    ),
    terminal,
  ).action(
    async (
      workDir: string | undefined,
      promptParts: string[] | undefined,
      opts: Record<string, unknown>,
    ) => {
      await runCliAction(
        () =>
          handleInteractive(
            {
              ...opts,
              positionalWorkDir: workDir,
              prompt: joinPromptParts(promptParts),
              program,
            },
            terminal,
          ),
        terminal,
      );
    },
  );

  for (const kind of ['image', 'video', 'audio'] as const) {
    registerDirectMediaCommand(program, kind, terminal, dependencies);
  }

  addLocaleOptions(
    addInteractiveOptions(
      addWorkDirOptions(
        program
          .command('resume')
          .description(t('agent.terminal.commander.command.resume'))
          .argument('[id]', t('agent.terminal.commander.argument.resumeId'))
          .argument('[prompt...]', t('agent.terminal.commander.argument.resumePrompt'))
          .option('--last', t('agent.terminal.commander.option.last')),
        terminal,
      ),
      terminal,
    ),
    terminal,
  ).action(
    async (
      id: string | undefined,
      promptParts: string[] | undefined,
      opts: Record<string, unknown>,
    ) => {
      await runCliAction(
        () => handleResumeCommand(id, promptParts, opts, program, terminal),
        terminal,
      );
    },
  );

  addLocaleOptions(
    program
      .command('completion')
      .description(t('agent.terminal.commander.command.completion'))
      .argument('[shell]', t('agent.terminal.commander.argument.shell'), 'zsh'),
    terminal,
  ).action((shell: string) => {
    runSyncCliAction(() => {
      console.log(generateCompletionScript(parseCompletionShell(shell, terminal)));
    }, terminal);
  });

  registerConfigCommands(program, terminal);
  registerDebugCommands(program, terminal);
  return program;
}

async function runCliAction(
  action: () => Promise<void>,
  terminal: AgentTerminalInvocationContext,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    failCli(error, terminal);
  }
}

function runSyncCliAction(action: () => void, terminal: AgentTerminalInvocationContext): void {
  try {
    action();
  } catch (error) {
    failCli(error, terminal);
  }
}

function failCli(error: unknown, terminal: AgentTerminalInvocationContext): never {
  const message =
    error instanceof CliWorkDirError
      ? presentCliWorkDirDiagnostic(error.diagnostic, terminal.presentation)
      : error instanceof TuiConversationIdError
        ? presentTuiConversationIdDiagnostic(error.diagnostic, terminal.presentation)
        : error instanceof DirectMediaCommandError
          ? presentDirectMediaCommandError(error, terminal.presentation)
          : error instanceof Error
            ? error.message
            : String(error);
  console.error(chalk.red(message));
  process.exit(1);
}

function registerDirectMediaCommand(
  program: Command,
  kind: DirectMediaKind,
  terminal: AgentTerminalInvocationContext,
  dependencies: CliProgramDependencies,
): void {
  addLocaleOptions(
    addWorkDirOptions(
      program
        .command(kind)
        .description(terminal.presentation.t(`agent.terminal.commander.command.${kind}`))
        .argument(
          '<prompt...>',
          terminal.presentation.t('agent.terminal.commander.argument.mediaPrompt'),
        )
        .option(
          '-m, --model <model>',
          terminal.presentation.t('agent.terminal.commander.option.mediaModel'),
        )
        .option('--json', terminal.presentation.t('agent.terminal.commander.option.json')),
      terminal,
    ),
    terminal,
  ).action(async (promptParts: string[], opts: Record<string, unknown>) => {
    await runCliAction(async () => {
      const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
      const directConfig = loadDirectMediaCommandConfig(workDir);
      const binding = await (dependencies.createDirectMediaRuntime ?? createDirectMediaRuntime)({
        workDir,
      });
      try {
        const result = await executeDirectMediaCommand(
          {
            kind,
            prompt: joinPromptParts(promptParts) ?? '',
            config: directConfig.config,
            modelOptions: directConfig.modelOptions,
            ...(typeof opts['model'] === 'string' ? { model: opts['model'] } : {}),
          },
          binding.runtime,
        );
        console.log(
          presentDirectMediaCommandResult(
            result,
            opts['json'] === true ? 'json' : 'text',
            terminal.presentation,
          ),
        );
      } finally {
        await binding.dispose();
      }
    }, terminal);
  });
}

function registerConfigCommands(program: Command, terminal: AgentTerminalInvocationContext): void {
  const { t } = terminal.presentation;
  const configCmd = program
    .command('config')
    .description(t('agent.terminal.commander.command.config'));
  const addConfigWorkDirOptions = (command: Command): Command =>
    addLocaleOptions(
      command
        .option('-C, --cwd <dir>', t('agent.terminal.commander.option.workspaceConfigWorkDir'))
        .option('--work-dir <dir>', t('agent.terminal.commander.option.workspaceConfigWorkDir')),
      terminal,
    );

  addConfigWorkDirOptions(
    configCmd.command('show').description(t('agent.terminal.commander.command.configShow')),
  ).action((opts: Record<string, unknown>) => {
    runSyncCliAction(() => {
      const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
      const config = loadHumanConfig(workDir, {}, terminal);
      writeTerminalProjection(
        presentConfigCommand(
          {
            kind: 'status',
            surface: 'process',
            config: {
              provider: config.provider,
              model: config.model,
              ...(config.apiKey ? { maskedApiKey: `***${config.apiKey.slice(-4)}` } : {}),
              ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
              maxOutputTokens: config.maxTokens,
              temperature: config.temperature,
              verbose: config.verbose,
              outputFormat: config.outputFormat,
              workDir: config.workDir,
              mcpServerCount: config.mcpServers.length,
            },
          },
          terminal.presentation,
        ),
      );
    }, terminal);
  });

  addConfigWorkDirOptions(
    configCmd
      .command('providers')
      .description(t('agent.terminal.commander.command.configProviders')),
  ).action((opts: Record<string, unknown>) => {
    runSyncCliAction(() => {
      const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
      writeTerminalProjection(
        presentConfigCommand(
          {
            kind: 'providers',
            providers: listProviders(workDir).map((provider) => ({
              id: provider.id,
              displayName: provider.displayName,
              type: provider.type,
              hasApiKey: provider.hasApiKey,
              models: provider.models,
            })),
          },
          terminal.presentation,
        ),
      );
    }, terminal);
  });

  addConfigWorkDirOptions(
    configCmd
      .command('models')
      .description(t('agent.terminal.commander.command.configModels'))
      .option('-p, --provider <provider>', t('agent.terminal.commander.option.configProvider')),
  ).action((opts: Record<string, unknown>) => {
    runSyncCliAction(() => {
      const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
      const config = loadHumanConfig(workDir, {}, terminal);
      const providerId = typeof opts['provider'] === 'string' ? opts['provider'] : config.provider;
      const models = getProviderModels(providerId, workDir);
      writeTerminalProjection(
        models.length === 0
          ? presentConfigCommand(
              { kind: 'diagnostic', code: 'models-empty', providerId },
              terminal.presentation,
            )
          : presentConfigCommand(
              {
                kind: 'models',
                providerId,
                currentModelId: config.model,
                models,
              },
              terminal.presentation,
            ),
      );
    }, terminal);
  });
}

function writeTerminalProjection(projection: ReturnType<typeof presentConfigCommand>): void {
  if (projection.kind === 'output') {
    console.log(projection.output);
    return;
  }
  if (projection.kind === 'error') {
    console.error(chalk.red(projection.error));
    process.exit(1);
  }
  throw new Error(`Unexpected config process projection: ${projection.kind}`);
}

function registerDebugCommands(program: Command, terminal: AgentTerminalInvocationContext): void {
  const { t } = terminal.presentation;
  const debugCmd = program
    .command('debug')
    .description(t('agent.terminal.commander.command.debug'));

  addLocaleOptions(
    addInteractiveOptions(
      addWorkDirOptions(
        debugCmd
          .command('automation')
          .description(t('agent.terminal.commander.command.debugAutomation'))
          .option('--stdio', t('agent.terminal.commander.option.stdio')),
        terminal,
      ),
      terminal,
    ),
    terminal,
  ).action(async (opts: Record<string, unknown>) => {
    await runCliAction(() => handleDebugAutomation(opts, program, terminal), terminal);
  });
}

// ============================================================================
// Handlers
// ============================================================================

async function handleDefault(
  promptParts: readonly string[],
  opts: Record<string, unknown>,
  program: Command,
  terminal: AgentTerminalInvocationContext,
): Promise<void> {
  const invocation = resolveDefaultCliInvocation(promptParts);
  const mergedOpts = {
    ...opts,
    ...(invocation.positionalWorkDir ? { positionalWorkDir: invocation.positionalWorkDir } : {}),
    ...(invocation.prompt ? { prompt: invocation.prompt } : {}),
  };

  if (opts['resume'] !== undefined) {
    await handleResume(
      {
        ...mergedOpts,
        resumeId: typeof opts['resume'] === 'string' ? opts['resume'] : undefined,
        useLast: opts['resume'] === true,
        program,
      },
      terminal,
    );
    return;
  }

  await handleInteractive({ ...mergedOpts, program }, terminal);
}

/**
 * Handle interactive TUI mode
 */
async function handleInteractive(
  opts: Record<string, unknown>,
  terminal: AgentTerminalInvocationContext,
): Promise<void> {
  const overrides: Partial<CLIConfig> = {};
  if (typeof opts['provider'] === 'string') overrides.provider = opts['provider'];
  if (typeof opts['model'] === 'string') overrides.model = opts['model'];
  if (typeof opts['apiKey'] === 'string') overrides.apiKey = opts['apiKey'];
  if (opts['verbose']) overrides.verbose = true;

  const program = readProgramOption(opts);
  const initialPrompt = typeof opts['prompt'] === 'string' ? opts['prompt'] : undefined;
  const invocationOptions = withGlobalOptions(program, opts);
  const workDir = resolveCliWorkDir(invocationOptions);

  const resumeFlag = opts['resume'];
  if (resumeFlag !== undefined) {
    await handleResume(
      {
        ...opts,
        resumeId: typeof resumeFlag === 'string' ? resumeFlag : undefined,
        useLast: resumeFlag === true,
        prompt: initialPrompt,
        program,
      },
      terminal,
    );
    return;
  }

  const config = loadHumanConfig(workDir, overrides, terminal);

  const validation = validateConfig(config);
  if (!validation.valid) {
    for (const line of presentConfigValidation(validation.diagnostics, terminal.presentation, {
      includeApiKeyHint: true,
    })) {
      console.error(chalk.red(line));
    }
    process.exit(1);
  }

  await renderTuiSession({ config, initialPrompt, terminal });
}

function loadHumanConfig(
  workDir: string,
  overrides: Partial<CLIConfig>,
  terminal: AgentTerminalInvocationContext,
): CLIConfig {
  try {
    return loadConfig(workDir, overrides);
  } catch (error) {
    if (error instanceof CliConfigLoadError) {
      throw new Error(presentConfigLoadDiagnostic(error.diagnostic, terminal.presentation));
    }
    throw error;
  }
}

async function renderTuiSession(input: {
  readonly config: CLIConfig;
  readonly initialPrompt?: string;
  readonly resumeConversationId?: string;
  readonly terminal: AgentTerminalInvocationContext;
}): Promise<void> {
  const { config, initialPrompt, resumeConversationId, terminal } = input;
  const capabilities = detectCapabilities();
  if (!capabilities.supportsColor) {
    chalk.level = 0;
  }

  const { t } = terminal.presentation;
  console.log(chalk.cyan.bold('\n  Neko Agent'));
  console.log(chalk.gray(`  ${t('agent.terminal.startup.model', { modelId: config.model })}`));
  console.log(chalk.gray(`  ${t('agent.terminal.startup.workDir', { path: config.workDir })}`));
  console.log(
    chalk.gray(
      `  ${t('agent.terminal.startup.mode', {
        executionMode: t('agent.terminal.value.executionMode.auto'),
      })}`,
    ),
  );
  console.log(chalk.gray(`  ${t('agent.terminal.startup.help')}\n`));

  const { waitUntilExit } = render(
    <App
      config={config}
      initialPrompt={initialPrompt}
      resumeConversationId={resumeConversationId}
      terminal={terminal}
    />,
  );
  try {
    await waitUntilExit();
  } finally {
  }
}

async function handleResumeCommand(
  id: string | undefined,
  promptParts: readonly string[] | undefined,
  opts: Record<string, unknown>,
  program: Command,
  terminal: AgentTerminalInvocationContext,
): Promise<void> {
  const last = opts['last'] === true;
  const promptFromParts = joinPromptParts(promptParts);
  const prompt = last && id && !promptFromParts ? id : promptFromParts;
  const resumeId = last ? undefined : id;
  await handleResume(
    {
      ...opts,
      resumeId,
      prompt,
      program,
    },
    terminal,
  );
}

async function handleResume(
  opts: Record<string, unknown>,
  terminal: AgentTerminalInvocationContext,
): Promise<void> {
  const overrides: Partial<CLIConfig> = {};
  if (typeof opts['provider'] === 'string') overrides.provider = opts['provider'];
  if (typeof opts['model'] === 'string') overrides.model = opts['model'];
  if (typeof opts['apiKey'] === 'string') overrides.apiKey = opts['apiKey'];
  if (opts['verbose']) overrides.verbose = true;

  const program = readProgramOption(opts);
  const invocationOptions = withGlobalOptions(program, opts);
  const workDir = resolveCliWorkDir(invocationOptions);
  const config = loadHumanConfig(workDir, overrides, terminal);
  const validation = validateConfig(config);
  if (!validation.valid) {
    for (const line of presentConfigValidation(validation.diagnostics, terminal.presentation, {
      includeApiKeyHint: false,
    })) {
      console.error(chalk.red(line));
    }
    process.exit(1);
  }

  const resumeId =
    typeof opts['resumeId'] === 'string' && opts['resumeId'].trim().length > 0
      ? opts['resumeId']
      : await resolveLatestResumeId(config.workDir, terminal);
  const canonicalResumeId = assertCanonicalTuiConversationId(resumeId);
  await renderTuiSession({
    config,
    resumeConversationId: canonicalResumeId,
    initialPrompt: typeof opts['prompt'] === 'string' ? opts['prompt'] : undefined,
    terminal,
  });
}

async function handleDebugAutomation(
  opts: Record<string, unknown>,
  program: Command,
  terminal: AgentTerminalInvocationContext,
): Promise<void> {
  if (opts['stdio'] !== true) {
    throw new Error(
      presentCliProcessDiagnostic({ code: 'debug-stdio-required' }, terminal.presentation),
    );
  }
  const workDir = resolveCliWorkDir(withGlobalOptions(program, opts));
  const manager = new TuiDebugAutomationSessionManager({
    defaultWorkDir: workDir,
    provider: typeof opts['provider'] === 'string' ? opts['provider'] : undefined,
    model: typeof opts['model'] === 'string' ? opts['model'] : undefined,
    apiKey: typeof opts['apiKey'] === 'string' ? opts['apiKey'] : undefined,
  });
  try {
    await runTuiDebugAutomationJsonLineServer({
      input: process.stdin,
      output: process.stdout,
      handler: manager,
    });
  } finally {
    await manager.disposeAll();
  }
}

function readProgramOption(opts: Record<string, unknown>): Command {
  const program = opts['program'];
  if (!(program instanceof Command)) {
    throw new Error('CLI program instance is required.');
  }
  return program;
}

async function resolveLatestResumeId(
  workDir: string,
  terminal: AgentTerminalInvocationContext,
): Promise<string> {
  let binding: Awaited<ReturnType<typeof createTuiLocalMetadataBinding>>;
  try {
    binding = await createTuiLocalMetadataBinding({
      homedir: nodeOs.homedir(),
      workDir,
    });
  } catch (error) {
    const diagnostic = projectLocalMetadataUserDiagnostic(error);
    if (!diagnostic) throw error;
    throw new Error(formatLocalMetadataUserDiagnostic(diagnostic), { cause: error });
  }
  try {
    const authority = await NodePiConversationAuthority.create({
      userDataRoot: join(nodeOs.homedir(), '.neko'),
      workspaceId: binding.workspaceId,
      hostId: `tui-resume-catalog-${process.pid}`,
    });
    try {
      const latest = authority
        .listConversations()
        .find((conversation) => isCanonicalTuiConversationId(conversation.conversationId));
      if (!latest) {
        throw new Error(
          presentCliProcessDiagnostic({ code: 'resume-not-found', workDir }, terminal.presentation),
        );
      }
      return latest.conversationId;
    } finally {
      await authority.dispose();
    }
  } finally {
    await binding.dispose();
  }
}

type CompletionShell = 'bash' | 'zsh' | 'fish';

function parseCompletionShell(
  value: string,
  terminal: AgentTerminalInvocationContext,
): CompletionShell {
  if (value === 'bash' || value === 'zsh' || value === 'fish') {
    return value;
  }
  throw new Error(
    presentCliProcessDiagnostic({ code: 'invalid-completion-shell', value }, terminal.presentation),
  );
}

function generateCompletionScript(shell: CompletionShell): string {
  switch (shell) {
    case 'bash':
      return BASH_COMPLETION_SCRIPT;
    case 'zsh':
      return ZSH_COMPLETION_SCRIPT;
    case 'fish':
      return FISH_COMPLETION_SCRIPT;
  }
}

const COMPLETION_COMMANDS = [
  'interactive',
  'resume',
  'image',
  'video',
  'audio',
  'completion',
  'config',
  'help',
];

const COMPLETION_OPTIONS = [
  '-C',
  '--cwd',
  '--cd',
  '--work-dir',
  '-p',
  '--provider',
  '-m',
  '--model',
  '-k',
  '--api-key',
  '-v',
  '--verbose',
  '-r',
  '--resume',
  '-h',
  '--help',
  '-V',
  '--version',
];

const ZSH_COMPLETION_SCRIPT = `#compdef neko

_neko() {
  local -a commands options
  commands=(${COMPLETION_COMMANDS.map((command) => `'${command}'`).join(' ')})
  options=(${COMPLETION_OPTIONS.map((option) => `'${option}'`).join(' ')})
  _arguments \\
    '1:command or prompt:(${COMPLETION_COMMANDS.join(' ')})' \\
    '*::arg:->args' \\
    ${COMPLETION_OPTIONS.map((option) => `'${option}[${option}]'`).join(' \\\n    ')}
}

_neko "$@"
`;

const BASH_COMPLETION_SCRIPT = `_neko_completion() {
  local cur commands options
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  commands="${COMPLETION_COMMANDS.join(' ')}"
  options="${COMPLETION_OPTIONS.join(' ')}"
  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( $(compgen -W "\${options}" -- "\${cur}") )
  else
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
  fi
}
complete -F _neko_completion neko
`;

const FISH_COMPLETION_SCRIPT = `${COMPLETION_COMMANDS.map(
  (command) => `complete -c neko -f -a ${command}`,
).join('\n')}
${COMPLETION_OPTIONS.map((option) =>
  option.startsWith('--')
    ? `complete -c neko -f -l ${option.slice(2)}`
    : `complete -c neko -f -s ${option.slice(1)}`,
).join('\n')}
`;

export function runCliEntrypoint(argv: readonly string[] = process.argv): void {
  let terminal: AgentTerminalInvocationContext;
  try {
    terminal = createNodeTerminalInvocationContextFromArgv(argv);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    console.error(chalk.red(error.message));
    process.exitCode = 1;
    return;
  }
  void createCliProgram(terminal).parseAsync(argv);
}
