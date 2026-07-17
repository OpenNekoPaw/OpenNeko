import { Command, type Argument, type Help, type HelpConfiguration, type Option } from 'commander';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';
import type { CliConfigLoadDiagnostic, CliConfigValidationDiagnostic } from '../core/config';
import type { CliWorkDirDiagnostic } from '../core/cli-workdir';
import type { LocaleResolutionDiagnostic } from '../core/locale-bootstrap';
import { formatTerminalDiagnosticLiteral } from './diagnostic-literal';

type PresentationContext = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export type CliProcessDiagnostic =
  | Readonly<{ readonly code: 'resume-not-found'; readonly workDir: string }>
  | Readonly<{ readonly code: 'invalid-completion-shell'; readonly value: string }>
  | Readonly<{ readonly code: 'debug-stdio-required' }>;

export function presentLocaleResolutionDiagnostic(
  diagnostic: LocaleResolutionDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'invalid-preference':
      return context.t('agent.terminal.cli.locale.invalidPreference', {
        source: diagnostic.source,
        value: formatTerminalDiagnosticLiteral(diagnostic.value),
      });
    case 'workspace-locale-forbidden':
      return context.t('agent.terminal.cli.locale.workspaceForbidden', { key: diagnostic.key });
  }
}

export function presentCliWorkDirDiagnostic(
  diagnostic: CliWorkDirDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'invalid-option-value':
      return context.t('agent.terminal.cli.workDir.invalidOptionValue', {
        option: diagnostic.option,
      });
    case 'conflicting-positional-option':
      return context.t('agent.terminal.cli.workDir.conflictingPositionalOption', {
        positionalPath: diagnostic.positionalPath,
        optionPath: diagnostic.optionPath,
      });
    case 'conflicting-options':
      return context.t('agent.terminal.cli.workDir.conflictingOptions', {
        firstOption: diagnostic.firstOption,
        firstPath: diagnostic.firstPath,
        secondOption: diagnostic.secondOption,
        secondPath: diagnostic.secondPath,
      });
    case 'missing-directory':
      return context.t('agent.terminal.cli.workDir.missingDirectory', { path: diagnostic.path });
    case 'not-directory':
      return context.t('agent.terminal.cli.workDir.notDirectory', { path: diagnostic.path });
  }
}

export function presentCliProcessDiagnostic(
  diagnostic: CliProcessDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'resume-not-found':
      return context.t('agent.terminal.cli.diagnostic.resumeNotFound', {
        path: diagnostic.workDir,
      });
    case 'invalid-completion-shell':
      return context.t('agent.terminal.cli.diagnostic.invalidCompletionShell', {
        value: diagnostic.value,
      });
    case 'debug-stdio-required':
      return context.t('agent.terminal.cli.diagnostic.debugStdioRequired');
  }
}

export class LocalizedCliCommand extends Command {
  public constructor(
    private readonly presentation: PresentationContext,
    name?: string,
  ) {
    super(name);
  }

  public override createCommand(name?: string): Command {
    return new LocalizedCliCommand(this.presentation, name);
  }

  public missingArgument(name: string): never {
    return this.error(
      this.presentation.t('agent.terminal.commander.diagnostic.missingArgument', { name }),
      {
        code: 'commander.missingArgument',
      },
    );
  }

  public optionMissingArgument(option: Option): never {
    return this.error(
      this.presentation.t('agent.terminal.commander.diagnostic.optionMissingArgument', {
        flags: option.flags,
      }),
      { code: 'commander.optionMissingArgument' },
    );
  }

  public missingMandatoryOptionValue(option: Option): never {
    return this.error(
      this.presentation.t('agent.terminal.commander.diagnostic.missingRequiredOption', {
        flags: option.flags,
      }),
      { code: 'commander.missingMandatoryOptionValue' },
    );
  }

  public unknownOption(flag: string): never {
    return this.error(
      this.presentation.t('agent.terminal.commander.diagnostic.unknownOption', { flag }),
      { code: 'commander.unknownOption' },
    );
  }

  public _excessArguments(receivedArgs: string[]): never {
    return this.error(
      this.presentation.t('agent.terminal.commander.diagnostic.excessArguments', {
        command: this.name(),
        expected: this.registeredArguments.length,
        received: receivedArgs.length,
      }),
      { code: 'commander.excessArguments' },
    );
  }

  public unknownCommand(): never {
    const command = this.args[0];
    if (command === undefined) {
      throw new Error('Commander invoked unknownCommand without an unknown command token.');
    }
    return this.error(
      this.presentation.t('agent.terminal.commander.diagnostic.unknownCommand', { command }),
      { code: 'commander.unknownCommand' },
    );
  }
}

export function configureLocalizedCommander(
  command: Command,
  context: PresentationContext,
): Command {
  return command
    .helpOption('-h, --help', context.t('agent.terminal.commander.helpOption'))
    .addHelpCommand('help [command]', context.t('agent.terminal.commander.helpCommand'))
    .configureHelp(createLocalizedHelpConfiguration(context));
}

export function presentConfigLoadDiagnostic(
  diagnostic: CliConfigLoadDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'missing-default-provider':
      return context.t('agent.terminal.cli.configLoad.missingDefaultProvider');
    case 'provider-not-configured':
      return context.t('agent.terminal.cli.configLoad.providerNotConfigured', {
        providerId: diagnostic.providerId,
      });
    case 'missing-provider-model':
      return context.t('agent.terminal.cli.configLoad.missingProviderModel', {
        providerId: diagnostic.providerId,
      });
    case 'platform-config-unavailable':
      return presentPlatformConfigDiagnostic(diagnostic.configCode, diagnostic.filePath, context);
  }
}

function presentPlatformConfigDiagnostic(
  code: Extract<
    CliConfigLoadDiagnostic,
    { readonly code: 'platform-config-unavailable' }
  >['configCode'],
  filePath: string,
  context: PresentationContext,
): string {
  switch (code) {
    case 'empty':
      return context.t('agent.terminal.cli.configLoad.empty', { path: filePath });
    case 'invalidToml':
      return context.t('agent.terminal.cli.configLoad.invalidToml', { path: filePath });
    case 'unsupportedVersion':
      return context.t('agent.terminal.cli.configLoad.unsupportedVersion', { path: filePath });
    case 'unsupportedProviderType':
      return context.t('agent.terminal.cli.configLoad.unsupportedProviderType', { path: filePath });
    case 'unsupportedProviderConnectionKind':
      return context.t('agent.terminal.cli.configLoad.unsupportedProviderConnectionKind', {
        path: filePath,
      });
    case 'unsupportedProviderProtocolProfile':
      return context.t('agent.terminal.cli.configLoad.unsupportedProviderProtocolProfile', {
        path: filePath,
      });
    case 'unsupportedProviderSupportLevel':
      return context.t('agent.terminal.cli.configLoad.unsupportedProviderSupportLevel', {
        path: filePath,
      });
    case 'unsupportedProtocolAuthType':
      return context.t('agent.terminal.cli.configLoad.unsupportedProtocolAuthType', {
        path: filePath,
      });
    case 'unsupportedProtocolStreamFormat':
      return context.t('agent.terminal.cli.configLoad.unsupportedProtocolStreamFormat', {
        path: filePath,
      });
    case 'unsupportedModelProtocolProfile':
      return context.t('agent.terminal.cli.configLoad.unsupportedModelProtocolProfile', {
        path: filePath,
      });
    case 'unsupportedModelProtocol':
      return context.t('agent.terminal.cli.configLoad.unsupportedModelProtocol', {
        path: filePath,
      });
    case 'duplicateProviderId':
      return context.t('agent.terminal.cli.configLoad.duplicateProviderId', { path: filePath });
    case 'duplicateModelId':
      return context.t('agent.terminal.cli.configLoad.duplicateModelId', { path: filePath });
    case 'invalidDefaultMaxTokens':
      return context.t('agent.terminal.cli.configLoad.invalidDefaultMaxTokens', { path: filePath });
    case 'invalidModelTokenMetadata':
      return context.t('agent.terminal.cli.configLoad.invalidModelTokenMetadata', {
        path: filePath,
      });
    case 'unsupportedProfileSchemaSection':
      return context.t('agent.terminal.cli.configLoad.unsupportedProfileSchemaSection', {
        path: filePath,
      });
    case 'unsupportedModelType':
      return context.t('agent.terminal.cli.configLoad.unsupportedModelType', { path: filePath });
    case 'unsupportedDefaultMediaModelType':
      return context.t('agent.terminal.cli.configLoad.unsupportedDefaultMediaModelType', {
        path: filePath,
      });
    case 'unsupportedDefaultModelType':
      return context.t('agent.terminal.cli.configLoad.unsupportedDefaultModelType', {
        path: filePath,
      });
    case 'unsupportedDefaultModelPurpose':
      return context.t('agent.terminal.cli.configLoad.unsupportedDefaultModelPurpose', {
        path: filePath,
      });
    case 'readError':
      return context.t('agent.terminal.cli.configLoad.readError', { path: filePath });
    case 'missingConfig':
      return context.t('agent.terminal.cli.configLoad.missingConfig', { path: filePath });
    case 'missingProvider':
      return context.t('agent.terminal.cli.configLoad.missingProvider', { path: filePath });
    case 'missingModel':
      return context.t('agent.terminal.cli.configLoad.missingModel', { path: filePath });
    case 'missingApiKey':
      return context.t('agent.terminal.cli.configLoad.missingApiKey', { path: filePath });
    case 'invalidDefaultProvider':
      return context.t('agent.terminal.cli.configLoad.invalidDefaultProvider', { path: filePath });
    case 'invalidDefaultModel':
      return context.t('agent.terminal.cli.configLoad.invalidDefaultModel', { path: filePath });
    case 'invalidDefaultModelBinding':
      return context.t('agent.terminal.cli.configLoad.invalidDefaultModelBinding', {
        path: filePath,
      });
    case 'unsupportedWorkspaceProviderDefinition':
      return context.t('agent.terminal.cli.configLoad.unsupportedWorkspaceProviderDefinition', {
        path: filePath,
      });
    case 'unsupportedWorkspaceModelDefinition':
      return context.t('agent.terminal.cli.configLoad.unsupportedWorkspaceModelDefinition', {
        path: filePath,
      });
    case 'unsupportedSkillSource':
      return context.t('agent.terminal.cli.configLoad.unsupportedSkillSource', { path: filePath });
    case 'missingAccountCatalog':
      return context.t('agent.terminal.cli.configLoad.missingAccountCatalog');
    case 'accountCatalogUnavailable':
      return context.t('agent.terminal.cli.configLoad.accountCatalogUnavailable');
    case 'accountModelNotEntitled':
      return context.t('agent.terminal.cli.configLoad.accountModelNotEntitled');
  }
}

export function presentConfigValidation(
  diagnostics: readonly CliConfigValidationDiagnostic[],
  context: PresentationContext,
  options: { readonly includeApiKeyHint: boolean },
): readonly string[] {
  const lines = [
    context.t('agent.terminal.cli.validation.header'),
    ...diagnostics.map(
      (diagnostic) => `  • ${presentConfigValidationDiagnostic(diagnostic, context)}`,
    ),
  ];
  if (options.includeApiKeyHint) {
    lines.push(
      '',
      context.t('agent.terminal.cli.validation.apiKeyHint'),
      context.t('agent.terminal.cli.validation.apiKeyExport'),
      context.t('agent.terminal.cli.validation.or'),
      context.t('agent.terminal.cli.validation.configUpdate'),
    );
  }
  return lines;
}

function presentConfigValidationDiagnostic(
  diagnostic: CliConfigValidationDiagnostic,
  context: PresentationContext,
): string {
  switch (diagnostic.code) {
    case 'missing-api-key':
      return context.t('agent.terminal.cli.validation.missingApiKey', {
        providerId: diagnostic.providerId,
      });
    case 'missing-model':
      return context.t('agent.terminal.cli.validation.missingModel');
    case 'invalid-temperature':
      return context.t('agent.terminal.cli.validation.invalidTemperature', {
        value: String(diagnostic.value),
      });
    case 'invalid-max-tokens':
      return context.t('agent.terminal.cli.validation.invalidMaxTokens', {
        value: String(diagnostic.value),
      });
    case 'invalid-output-format':
      return context.t('agent.terminal.cli.validation.invalidOutputFormat', {
        value: diagnostic.value,
      });
  }
}

function createLocalizedHelpConfiguration(context: PresentationContext): HelpConfiguration {
  return {
    argumentDescription: (argument) => describeArgument(argument, context),
    optionDescription: (option) => describeOption(option, context),
    formatHelp: (command, helper) => formatLocalizedHelp(command, helper, context),
  };
}

function describeArgument(argument: Argument, context: PresentationContext): string {
  return withDefaultValue(
    argument.description,
    argument.defaultValue,
    argument.defaultValueDescription,
    context,
  );
}

function describeOption(option: Option, context: PresentationContext): string {
  return withDefaultValue(
    option.description,
    option.defaultValue,
    option.defaultValueDescription,
    context,
  );
}

function withDefaultValue(
  description: string,
  defaultValue: unknown,
  defaultValueDescription: string | undefined,
  context: PresentationContext,
): string {
  if (defaultValue === undefined) return description;
  return context.t('agent.terminal.commander.defaultValue', {
    description,
    value: defaultValueDescription ?? String(defaultValue),
  });
}

function formatLocalizedHelp(command: Command, helper: Help, context: PresentationContext): string {
  const termWidth = helper.padWidth(command, helper);
  const helpWidth = helper.helpWidth ?? 80;
  const itemIndentWidth = 2;
  const itemSeparatorWidth = 2;
  const formatItem = (term: string, description: string): string => {
    if (!description) return term;
    const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
    return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
  };
  const formatList = (items: readonly string[]): string =>
    items.join('\n').replace(/^/gm, ' '.repeat(itemIndentWidth));
  const output = [
    `${context.t('agent.terminal.commander.section.usage')} ${helper.commandUsage(command)}`,
    '',
  ];
  const description = helper.commandDescription(command);
  if (description.length > 0) output.push(helper.wrap(description, helpWidth, 0), '');
  appendSection(
    output,
    context.t('agent.terminal.commander.section.arguments'),
    helper
      .visibleArguments(command)
      .map((argument) =>
        formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument)),
      ),
    formatList,
  );
  appendSection(
    output,
    context.t('agent.terminal.commander.section.options'),
    helper
      .visibleOptions(command)
      .map((option) => formatItem(helper.optionTerm(option), helper.optionDescription(option))),
    formatList,
  );
  if (helper.showGlobalOptions) {
    appendSection(
      output,
      context.t('agent.terminal.commander.section.globalOptions'),
      helper
        .visibleGlobalOptions(command)
        .map((option) => formatItem(helper.optionTerm(option), helper.optionDescription(option))),
      formatList,
    );
  }
  appendSection(
    output,
    context.t('agent.terminal.commander.section.commands'),
    helper
      .visibleCommands(command)
      .map((subcommand) =>
        formatItem(helper.subcommandTerm(subcommand), helper.subcommandDescription(subcommand)),
      ),
    formatList,
  );
  return output.join('\n');
}

function appendSection(
  output: string[],
  title: string,
  items: readonly string[],
  formatList: (items: readonly string[]) => string,
): void {
  if (items.length > 0) output.push(title, formatList(items), '');
}
