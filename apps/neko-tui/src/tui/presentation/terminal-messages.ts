import type { AgentCommandMessageKey } from '@neko/agent/commands/terminal-messages';
import type { StrictMessageBundleSource } from '@neko/shared/i18n';

export const CLI_TERMINAL_MESSAGES_EN = {
  'agent.terminal.commander.section.usage': 'Usage:',
  'agent.terminal.commander.section.arguments': 'Arguments:',
  'agent.terminal.commander.section.options': 'Options:',
  'agent.terminal.commander.section.globalOptions': 'Global Options:',
  'agent.terminal.commander.section.commands': 'Commands:',
  'agent.terminal.commander.defaultValue': '{description} (default: {value})',
  'agent.terminal.commander.helpOption': 'Display help for command',
  'agent.terminal.commander.helpCommand': 'Display help for command',
  'agent.terminal.commander.versionOption': 'Output the version number',
  'agent.terminal.commander.program.description': 'OpenNeko AI Agent — Professional Terminal UI',
  'agent.terminal.commander.command.interactive': 'Start interactive TUI mode',
  'agent.terminal.commander.command.image': 'Generate an image directly without Agent execution',
  'agent.terminal.commander.command.video': 'Generate a video directly without Agent execution',
  'agent.terminal.commander.command.audio': 'Generate audio directly without Agent execution',
  'agent.terminal.commander.command.resume': 'Resume a previous interactive session',
  'agent.terminal.commander.command.completion': 'Generate shell completion scripts',
  'agent.terminal.commander.command.config': 'Manage configuration',
  'agent.terminal.commander.command.configShow': 'Show current configuration',
  'agent.terminal.commander.command.configProviders': 'List available providers',
  'agent.terminal.commander.command.configModels': 'List available models for the current provider',
  'agent.terminal.commander.command.debug': 'Local developer automation and diagnostics',
  'agent.terminal.commander.command.debugAutomation':
    'Start the local developer automation protocol for the complete TUI session',
  'agent.terminal.commander.argument.initialPrompt': 'Optional user prompt to start the session',
  'agent.terminal.commander.argument.workDir':
    'Working directory for workspace config and file tools',
  'agent.terminal.commander.argument.startupPrompt': 'Optional user prompt to submit after startup',
  'agent.terminal.commander.argument.resumeId':
    'Conversation id to resume; omit to continue the most recent',
  'agent.terminal.commander.argument.resumePrompt': 'Optional prompt to submit after resume',
  'agent.terminal.commander.argument.shell': 'Shell type (bash, zsh, fish)',
  'agent.terminal.commander.argument.mediaPrompt': 'Media generation prompt',
  'agent.terminal.commander.option.workDir':
    'Working directory for workspace config and file tools',
  'agent.terminal.commander.option.workspaceConfigWorkDir':
    'Working directory for workspace config',
  'agent.terminal.commander.option.provider': 'AI provider (anthropic, openai, deepseek)',
  'agent.terminal.commander.option.model': 'Model ID',
  'agent.terminal.commander.option.mediaModel': 'Media model ID or provider:model identity',
  'agent.terminal.commander.option.json': 'Print structured JSON output',
  'agent.terminal.commander.option.apiKey': 'API key',
  'agent.terminal.commander.option.verbose': 'Enable verbose output',
  'agent.terminal.commander.option.uiLocale': 'Terminal language (auto, en, zh-cn)',
  'agent.terminal.commander.option.promptLocale':
    'Built-in Agent prompt language (auto, en, zh-cn)',
  'agent.terminal.commander.option.resume':
    'Resume a previous conversation (omit id to continue the most recent)',
  'agent.terminal.commander.option.last': 'Continue the most recent conversation',
  'agent.terminal.commander.option.configProvider': 'Provider to list models for',
  'agent.terminal.commander.option.stdio': 'Use newline-delimited JSON over stdio',
  'agent.terminal.commander.diagnostic.missingArgument':
    "error: missing required argument '{name}'",
  'agent.terminal.commander.diagnostic.optionMissingArgument':
    "error: option '{flags}' argument missing",
  'agent.terminal.commander.diagnostic.missingRequiredOption':
    "error: required option '{flags}' not specified",
  'agent.terminal.commander.diagnostic.unknownOption': "error: unknown option '{flag}'",
  'agent.terminal.commander.diagnostic.excessArguments':
    'error: too many arguments for {command}. Expected {expected} but got {received}.',
  'agent.terminal.commander.diagnostic.unknownCommand': "error: unknown command '{command}'",
  'agent.terminal.directMedia.completed': '{kind} generation completed: {taskScope} ({model})',
  'agent.terminal.directMedia.diagnostic.direct-media-empty-prompt':
    'Direct media generation requires a non-empty prompt. {detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-model-unavailable':
    'Direct media model is unavailable. {detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-model-kind-mismatch':
    'Direct media model category does not match the command. {detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-task-failed':
    'Direct media task failed ({taskScope}). {detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-task-cancelled':
    'Direct media task was cancelled ({taskScope}). {detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-result-unavailable':
    'Direct media task completed without a stable result ({taskScope}). {detail}',
  'agent.terminal.cli.configLoad.missingDefaultProvider':
    'No default provider is configured in ~/.neko/config.toml.',
  'agent.terminal.cli.configLoad.providerNotConfigured':
    'Provider "{providerId}" is not configured in ~/.neko/config.toml.',
  'agent.terminal.cli.configLoad.missingProviderModel':
    'No model is configured for provider "{providerId}".',
  'agent.terminal.cli.configLoad.empty':
    'Configuration file is empty: {path}. Fix it, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.invalidToml':
    'Configuration file contains invalid TOML: {path}. Fix it, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedVersion':
    'Configuration file uses an unsupported version: {path}. Update OpenNeko or migrate the file, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedProviderType':
    'Configuration file contains an unsupported provider type: {path}. Use a supported provider type, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedProviderConnectionKind':
    'Configuration file contains an unsupported provider connection_kind: {path}. Use gateway, local, or direct, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedProviderProtocolProfile':
    'Configuration file contains an unsupported provider protocol_profile: {path}. Use a supported protocol profile, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedProviderSupportLevel':
    'Configuration file contains an unsupported provider support_level: {path}. Use verified, compatible, experimental, or custom, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedProtocolAuthType':
    'Configuration file contains an unsupported protocol_variant auth_type: {path}. Use bearer, api-key, or custom-header, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedProtocolStreamFormat':
    'Configuration file contains an unsupported protocol_variant stream_format: {path}. Use sse or ndjson, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedModelProtocolProfile':
    'Configuration file contains an unsupported model protocol_profile: {path}. Use a supported protocol profile, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedModelProtocol':
    'Configuration file contains an unsupported model protocol: {path}. Use a supported provider type for protocol overrides, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.duplicateProviderId':
    'Configuration file contains duplicate provider IDs: {path}. Remove the duplicates, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.duplicateModelId':
    'Configuration file contains duplicate model IDs: {path}. Remove the duplicates, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.invalidDefaultMaxTokens':
    'Configuration file contains an invalid defaults.max_tokens value: {path}. Use a positive integer, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.invalidModelTokenMetadata':
    'Configuration file contains invalid model token metadata: {path}. Use positive integers for context and output token limits, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedProfileSchemaSection':
    'Configuration file contains unsupported Agent profile schema sections: {path}. Install an Agent profile package instead, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedModelType':
    'Configuration file contains an unsupported model type: {path}. Use llm, image, video, or audio, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedDefaultMediaModelType':
    'Configuration file contains retired default_media_models: {path}. Move them to default_models, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedDefaultModelType':
    'Configuration file contains an unsupported default_models key: {path}. Use llm, image, video, or audio, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedDefaultModelPurpose':
    'Configuration file contains an invalid default_model_purposes entry: {path}. Use provider_id and model_id, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.readError':
    'Unable to read configuration file: {path}. Check file permissions, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.missingConfig':
    'Agent configuration file is missing: {path}. Create it with an enabled provider and chat model, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.missingProvider':
    'Agent configuration has no enabled providers: {path}. Add an enabled provider, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.missingModel':
    'Agent configuration has no enabled chat models: {path}. Add an enabled chat model, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.missingApiKey':
    'Agent configuration has no configured enabled chat provider: {path}. Add the required endpoint and credentials, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.invalidDefaultProvider':
    'Agent configuration selects an unavailable default provider: {path}. Fix default_provider, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.invalidDefaultModel':
    'Agent configuration selects an unavailable default chat model: {path}. Fix default_model, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.invalidDefaultModelBinding':
    'Configuration contains an unavailable or incompatible default model binding: {path}. Fix the binding, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedWorkspaceProviderDefinition':
    'Workspace configuration defines providers: {path}. Move provider definitions and credentials to user configuration, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedWorkspaceModelDefinition':
    'Workspace configuration defines models: {path}. Move model definitions to user configuration or the account catalog, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.unsupportedSkillSource':
    'Configuration references a non-standard Skill source: {path}. Use .agents/skills, .neko/commands, or an explicit source provider.',
  'agent.terminal.cli.configLoad.missingAccountCatalog':
    'The Neko account AI catalog is unavailable. Sign in or configure a local AI provider, then restart Neko Agent.',
  'agent.terminal.cli.configLoad.accountCatalogUnavailable':
    'The Neko account AI catalog is temporarily unavailable. Refresh Agent or configure a local AI provider.',
  'agent.terminal.cli.configLoad.accountModelNotEntitled':
    'The selected AI model is not included in the current Neko account entitlement. Choose another model or update the plan.',
  'agent.terminal.cli.validation.header': 'Configuration errors:',
  'agent.terminal.cli.validation.missingApiKey':
    'API key not found for provider "{providerId}". Use --api-key, the provider environment variable, or ~/.neko/config.toml.',
  'agent.terminal.cli.validation.missingModel':
    'Model is required. Use --model or configure it in ~/.neko/config.toml.',
  'agent.terminal.cli.validation.invalidTemperature':
    'Temperature must be between 0 and 2; received {value}.',
  'agent.terminal.cli.validation.invalidMaxTokens':
    'maxTokens must be a positive integer; received {value}.',
  'agent.terminal.cli.validation.invalidOutputFormat':
    'outputFormat must be text, json, or markdown; received "{value}".',
  'agent.terminal.cli.validation.apiKeyHint': 'Set your API key:',
  'agent.terminal.cli.validation.apiKeyExport': '  export ANTHROPIC_API_KEY=sk-ant-...',
  'agent.terminal.cli.validation.or': '  # or',
  'agent.terminal.cli.validation.configUpdate': '  update ~/.neko/config.toml',
  'agent.terminal.cli.diagnostic.resumeNotFound':
    'No saved TUI conversation was found in work directory: {path}',
  'agent.terminal.cli.diagnostic.invalidCompletionShell':
    'Invalid shell "{value}". Expected: bash, zsh, or fish.',
  'agent.terminal.cli.diagnostic.debugStdioRequired':
    'Debug automation requires the --stdio option.',
  'agent.terminal.cli.locale.invalidPreference':
    'Invalid Locale value for {source}: {value}. Expected auto, en, or zh-cn.',
  'agent.terminal.cli.locale.workspaceForbidden':
    'Workspace configuration must not define {key}; Locale preferences are user configuration only.',
  'agent.terminal.diagnostic.conversation.nonCanonical':
    'TUI resume conversation id must be canonical; received {conversationId}. Start a new TUI conversation or choose a canonical workspace conversation id.',
  'agent.terminal.cli.workDir.invalidOptionValue': '{option} must be a string.',
  'agent.terminal.cli.workDir.conflictingPositionalOption':
    'Conflicting working directories: positional {positionalPath} differs from option {optionPath}',
  'agent.terminal.cli.workDir.conflictingOptions':
    'Conflicting working directories: {firstOption} {firstPath} differs from {secondOption} {secondPath}',
  'agent.terminal.cli.workDir.missingDirectory': 'Working directory does not exist: {path}',
  'agent.terminal.cli.workDir.notDirectory': 'Working directory is not a directory: {path}',
  'agent.terminal.suggestion.command.mode': 'Show or switch session mode',
  'agent.terminal.suggestion.command.model': 'List or switch the current chat model',
  'agent.terminal.suggestion.command.media': 'List or switch image/video/audio models',
  'agent.terminal.suggestion.command.param': 'Show or set LLM and media parameters',
  'agent.terminal.suggestion.command.queue': 'List, send next, cancel, or edit queued prompts',
  'agent.terminal.suggestion.command.mcp': 'Show MCP server status, tools, and connection controls',
  'agent.terminal.suggestion.command.capability':
    'Show TUI capability providers, diagnostics, and tools',
  'agent.terminal.suggestion.command.artifact':
    'List, show, open, or send terminal artifact references',
  'agent.terminal.suggestion.command.compact': 'Compact the current Agent context',
  'agent.terminal.suggestion.command.status':
    'Show mode, model, queue, Skill, task, and context state',
  'agent.terminal.suggestion.command.auto': 'Switch to auto execution mode',
  'agent.terminal.suggestion.command.ask': 'Switch to ask-before-action execution mode',
  'agent.terminal.suggestion.command.skill': 'Activate or deactivate a Skill lifecycle record',
  'agent.terminal.skill.catalogUnavailable':
    'No skills loaded from the standard Neko Skill catalog.',
  'agent.terminal.skill.catalogEmpty': 'No skills available in the standard Neko Skill catalog.',
  'agent.terminal.skill.deactivationAmbiguous':
    'Multiple active Skill lifecycle records. Use /skill off <recordId|slot|skillName>. Active: {records}',
  'agent.terminal.skill.invoked': 'Skill invoked: {skillName}',
  'agent.terminal.skill.menu.title': 'Select Skill',
  'agent.terminal.skill.menu.deactivate.label': 'Deactivate',
  'agent.terminal.skill.menu.deactivate.description': 'Clear active skill',
  'agent.terminal.diagnostic.skill.notFound':
    'Skill not found: "{skillName}". Use /skill to browse.',
  'agent.terminal.diagnostic.skill.invocationInvalid': 'Invalid Skill invocation: {input}',
  'agent.terminal.diagnostic.skill.serviceUnavailable':
    'Skill service is not available for this session.',
  'agent.terminal.diagnostic.skill.disabled': 'Skill is disabled: {skillName}',
  'agent.terminal.diagnostic.skill.loadFailed': 'Failed to load Skill: {skillName}',
  'agent.terminal.diagnostic.skill.loadFailedWithDetail':
    'Failed to load Skill {skillName}: {detail}',
  'agent.terminal.diagnostic.skill.noContent': 'Skill has no prompt content: {skillName}',
  'agent.terminal.diagnostic.skill.invocationFailed': 'Skill invocation failed: {detail}',
  'agent.terminal.diagnostic.command.unknown':
    'Unknown command: {input}. Type /help for available commands.',
  'agent.terminal.diagnostic.command.failed': 'Command failed: {detail}',
  'agent.terminal.parameter.status.header': 'LLM Parameters:',
  'agent.terminal.parameter.status.row': '  {name}: {value}',
  'agent.terminal.parameter.status.advanced': '  advanced:',
  'agent.terminal.parameter.status.advancedRow': '    {name}: {value}',
  'agent.terminal.parameter.usage':
    'Usage: /param set <reasoning|verbosity|creativity|temperature|topP|maxOutputTokens|reasoningEffort|thinkingBudget|serviceTier> <value>',
  'agent.terminal.parameter.reset': 'LLM parameters reset.',
  'agent.terminal.parameter.updated': 'Parameter updated: {name} = {value}',
  'agent.terminal.parameter.applied.header': 'Applied parameters:',
  'agent.terminal.parameter.applied.row': '  {name} = {value}',
  'agent.terminal.parameter.applied.providerOptions': '  providerOptions = {names}',
  'agent.terminal.parameter.applied.defaults': 'Applied provider defaults.',
  'agent.terminal.value.default': '(default)',
  'agent.terminal.diagnostic.parameter.unavailable':
    'Parameter control is not available for this session.',
  'agent.terminal.diagnostic.parameter.usage':
    'Usage: /param set <name> <value> | /param status | /param reset',
  'agent.terminal.diagnostic.parameter.setUsage': 'Usage: /param set <name> <value>',
  'agent.terminal.diagnostic.parameter.unsupported':
    'Unsupported parameter: {name}. Valid: reasoning, verbosity, creativity, temperature, topP, maxOutputTokens, reasoningEffort, thinkingBudget, serviceTier',
  'agent.terminal.diagnostic.parameter.invalid-reasoning':
    'Invalid reasoning preset. Valid: fast, balanced, deep',
  'agent.terminal.diagnostic.parameter.invalid-verbosity-preset':
    'Invalid verbosity preset. Valid: brief, standard, detailed',
  'agent.terminal.diagnostic.parameter.invalid-creativity':
    'Invalid creativity preset. Valid: stable, creative, wild',
  'agent.terminal.diagnostic.parameter.numberRange': '{name} must be a number between 0 and 2',
  'agent.terminal.diagnostic.parameter.positiveInteger': '{name} must be a positive integer',
  'agent.terminal.diagnostic.parameter.invalid-reasoning-effort':
    'Invalid reasoningEffort. Valid: none, minimal, low, medium, high, xhigh',
  'agent.terminal.diagnostic.parameter.invalid-text-verbosity':
    'Invalid verbosity. Valid: low, medium, high',
  'agent.terminal.diagnostic.parameter.invalid-service-tier':
    'Invalid serviceTier. Valid: auto, default, fast, flex, priority',
  'agent.terminal.diagnostic.parameter.validationFailed': 'Parameter validation failed',
  'agent.terminal.diagnostic.parameter.providerNotConfigured':
    'Provider "{providerId}" is not configured.',
  'agent.terminal.diagnostic.parameter.modelNotConfigured': 'Model "{modelId}" is not configured.',
  'agent.terminal.diagnostic.parameter.unsupportedReasoningEffort':
    'Selected model does not support reasoning effort parameter: {field}',
  'agent.terminal.diagnostic.parameter.unsupportedThinkingBudget':
    'Selected model or provider does not support thinking budget parameter: {field}',
  'agent.terminal.diagnostic.parameter.unsupportedVerbosity':
    'Selected model does not support output verbosity parameter: {field}',
  'agent.terminal.diagnostic.parameter.unsupportedTemperature':
    'Selected model does not support temperature parameter: {field}',
  'agent.terminal.diagnostic.parameter.unsupportedTopP':
    'Selected model does not support topP parameter: {field}',
  'agent.terminal.diagnostic.parameter.unsupportedFastTier':
    'Selected model or provider does not support fast service tier: {field}',
  'agent.terminal.diagnostic.parameter.unsupportedServiceTier':
    'Selected provider does not support requested service tier: {field}',
  'agent.terminal.diagnostic.parameter.unsupportedMaxOutputTokens':
    'Selected model does not support max output tokens parameter: {field}',
  'agent.terminal.diagnostic.parameter.invalidAnthropicThinkingSampling':
    'Anthropic thinking requests cannot include sampling parameter: {field}',
  'agent.terminal.lifecycle.goodbye': 'Goodbye!',
  'agent.terminal.history.cleared': 'History cleared.',
  'agent.terminal.sessionMode.current': 'Session mode: {mode}',
  'agent.terminal.sessionMode.available': 'Available: {modes}',
  'agent.terminal.sessionMode.usage': 'Usage: /mode agent|image|video|audio',
  'agent.terminal.sessionMode.selected': 'Session mode set to: {mode}',
  'agent.terminal.executionMode.plan': 'Plan mode enabled',
  'agent.terminal.executionMode.ask': 'Ask mode enabled',
  'agent.terminal.executionMode.auto': 'Auto mode enabled',
  'agent.terminal.context.compacted':
    'Context compressed: {originalTokens} -> {compressedTokens} tokens ({percentage}%)',
  'agent.terminal.diagnostic.sessionMode.unsupported':
    'Unsupported session mode: {mode}. Valid: {modes}',
  'agent.terminal.diagnostic.sessionMode.unavailable':
    'Session mode switching is not available for this session.',
  'agent.terminal.diagnostic.executionMode.unavailable':
    'Execution mode switching is not available for this session.',
  'agent.terminal.diagnostic.context.compactionUnavailable':
    'Context compaction is not available for this session.',
  'agent.terminal.startup.model': 'Model: {modelId}',
  'agent.terminal.startup.workDir': 'Work directory: {path}',
  'agent.terminal.startup.mode': 'Mode: {executionMode}',
  'agent.terminal.startup.help': 'Type /help for commands, Ctrl+C to exit',
  'agent.terminal.message.systemError': 'Error: {detail}',
  'agent.terminal.reference.loadingErrorOne': 'Reference error:',
  'agent.terminal.reference.loadingErrorMany': 'Reference errors:',
  'agent.terminal.reference.loadingErrorRow': '- {reference}: {detail}',
  'agent.terminal.reference.suggestionFailed': 'Failed to load reference suggestions: {detail}',
  'agent.terminal.reference.readFailed': 'Failed to read {path}: {detail}',
  'agent.terminal.reference.parseFailed': 'Failed to parse {path}: {detail}',
  'agent.terminal.reference.expectedObject': '{source} must contain a JSON object.',
  'agent.terminal.reference.expectedArray': '{source} must be an array.',
  'agent.terminal.reference.expectedEntryObject': '{source}[{index}] must be a JSON object.',
  'agent.terminal.reference.invalidEntry': '{source}[{index}] is invalid.',
  'agent.terminal.reference.expectedStringField': '{source}.{field} must be a string.',
  'agent.terminal.runtime.workspaceContentReadFailed': 'Failed to read {path}: {detail}',
  'agent.terminal.runtime.workspaceContentParseFailed': 'Failed to parse {path}: {detail}',
  'agent.terminal.runtime.resumeNotFoundStartingFresh':
    'Conversation "{conversationId}" was not found; starting fresh.',
  'agent.terminal.runtime.continuationDiscarded': 'Continuation discarded: {itemId}',
  'agent.terminal.runtime.skillInvocationRejected': 'Skill "{skillName}" is unavailable.',
  'agent.terminal.runtime.taskContinuationReady':
    'Task result is ready. Continuing from the completed asynchronous result.',
  'agent.terminal.runtime.taskContinuationReadyWithId':
    'Task result {taskId} is ready. Continuing from the completed asynchronous result.',
  'agent.terminal.runtime.subagentContinuationReady':
    'Subagent result is ready. Continuing from the completed subagent result.',
  'agent.terminal.runtime.subagentContinuationReadyWithId':
    'Subagent result {subagentId} is ready. Continuing from the completed subagent result.',
  'agent.terminal.runtime.systemContinuationReady':
    'System continuation is ready. Continuing Agent execution.',
  'agent.terminal.runtime.taskContinuationQueued':
    'Task continuation queued: {itemId} ({pendingCount} pending)',
  'agent.terminal.runtime.subagentContinuationQueued':
    'Subagent result continuation queued: {itemId} ({pendingCount} pending)',
  'agent.terminal.runtime.systemContinuationQueued':
    'System continuation queued: {itemId} ({pendingCount} pending)',
  'agent.terminal.runtime.workspaceStateSyncFailed':
    'Workspace runtime state sync failed: {detail}',
  'agent.terminal.runtime.taskStatusRefreshFailed': 'Task status refresh failed: {detail}',
  'agent.terminal.runtime.taskResultReady': 'Task result is ready. Continue with: {prompt}',
  'agent.terminal.runtime.mediaResultPersistenceFailed':
    'Failed to persist media task result URLs.',
  'agent.terminal.runtime.mediaResultPersistenceFailedWithDetail':
    'Failed to persist media task result URLs: {detail}',
  'agent.terminal.runtime.mediaProgressDeliveryFailed':
    'Failed to deliver media task progress: {taskId}',
  'agent.terminal.runtime.mediaProgressDeliveryFailedWithDetail':
    'Failed to deliver media task progress: {taskId}: {detail}',
  'agent.terminal.runtime.taskObservation.notTerminal':
    'Task result cannot be recorded because task {taskId} is not terminal.',
  'agent.terminal.runtime.taskObservation.invalidOwnerScope':
    'Task {taskId} has an invalid owner scope.',
  'agent.terminal.runtime.taskObservation.ownerScopeMismatch':
    'Task {taskId} result belongs to a different owner scope.',
  'agent.terminal.runtime.taskObservation.malformedResultRef':
    'Task {taskId} contains a malformed result reference.',
  'agent.terminal.runtime.taskObservation.unsafeResultRef':
    'Task {taskId} contains an unsafe result reference.',
  'agent.terminal.runtime.taskObservation.invalidDeliveryPolicy':
    'Task {taskId} has an invalid result delivery policy.',
  'agent.terminal.runtime.taskObservation.invalidTaskGroup':
    'Task {taskId} has an invalid result delivery group.',
  'agent.terminal.runtime.taskObservation.recordingFailed':
    'Failed to record the result for task {taskId}: {detail}',
  'agent.terminal.runtime.taskObservation.recordingFailedWithoutDetail':
    'Failed to record the result for task {taskId}.',
  'agent.terminal.runtime.taskObservation.followupFailed':
    'Failed to continue after task {taskId}: {detail}',
  'agent.terminal.runtime.taskObservation.followupFailedWithoutDetail':
    'Failed to continue after task {taskId}.',
  'agent.terminal.errorBoundary.crashed': '{label} crashed',
  'agent.terminal.errorBoundary.recovery': 'Press Ctrl+L to reset, or Ctrl+C to quit.',
  'agent.terminal.queue.unknownItem': 'Unknown queue item: {itemId}',
  'agent.terminal.queue.continuationNotEditable': 'Queued continuation cannot be edited: {itemId}',
  'agent.terminal.queue.draftConflict':
    'The queued message changed before the edit could be applied.',
  'agent.terminal.queue.status.empty': 'Queue: empty (version {version})',
  'agent.terminal.queue.status.header': 'Queue: {pendingCount} pending (version {version})',
  'agent.terminal.queue.status.row': '{index}. {itemId} [{source}] {content}',
  'agent.terminal.queue.enqueued': 'Message queued ({pendingCount} pending)',
  'agent.terminal.queue.promotedUserMessage':
    'Queued message scheduled as next eligible user message: {itemId}',
  'agent.terminal.queue.promotedContinuation':
    'Queued continuation promoted within continuation priority: {itemId}',
  'agent.terminal.queue.cancelled': 'Queued message cancelled: {itemId}',
  'agent.terminal.queue.discarded': 'Queued continuation discarded: {itemId}',
  'agent.terminal.queue.edited': 'Queued message edited: {itemId}',
  'agent.terminal.diagnostic.queue.unavailable':
    'Message queue controls are not available for this session.',
  'agent.terminal.diagnostic.queue.usage':
    'Usage: /queue list | /queue promote <id> | /queue send-next <id> | /queue cancel <id> | /queue discard <id> | /queue edit <id> <text>',
  'agent.terminal.diagnostic.queue.editUsage': 'Usage: /queue edit <id> <text>',
  'agent.terminal.diagnostic.queue.sendNowUnsupported':
    'The send-now command cannot interrupt the active turn. Use /queue send-next <id> or /queue promote <id>.',
  'agent.terminal.diagnostic.queue.discardUnavailable':
    'Queue continuation discard is not available for this session.',
  'agent.terminal.diagnostic.queue.operationUnavailable':
    'Queue operation is not available for this session: {operation}',
  'agent.terminal.diagnostic.queue.unknownCommand':
    'Unknown queue command: {command}. Usage: /queue list | /queue promote <id> | /queue send-next <id> | /queue cancel <id> | /queue discard <id> | /queue edit <id> <text>',
  'agent.terminal.diagnostic.queue.operationFailed': 'Queue operation failed: {detail}',
  'agent.terminal.diagnostic.queue.operationFailedWithCode':
    'Queue operation failed ({operationCode}): {detail}',
  'agent.terminal.task.empty': 'No tasks.',
  'agent.terminal.task.emptyFiltered': 'No {status} tasks.',
  'agent.terminal.task.header': 'Tasks:',
  'agent.terminal.task.headerFiltered': 'Tasks ({status}):',
  'agent.terminal.task.row': '  {id}  {status}  {progress}%  {runMode}  {title}',
  'agent.terminal.task.rowWithError':
    '  {id}  {status}  {progress}%  {runMode}  {title}  error={error}',
  'agent.terminal.task.usage': 'Usage: /tasks [pending|running|completed|failed|cancelled|all]',
  'agent.terminal.diagnostic.task.unavailable': 'Task status is not available for this session.',
  'agent.terminal.diagnostic.task.usage':
    'Usage: /tasks [pending|running|completed|failed|cancelled|all] or /tasks status [status]',
  'agent.terminal.mcp.servers.empty': 'No MCP servers configured.',
  'agent.terminal.mcp.servers.header': 'MCP Servers:',
  'agent.terminal.mcp.servers.transport': 'transport={transport}',
  'agent.terminal.mcp.servers.tools': 'tools={count}',
  'agent.terminal.mcp.servers.row': '  {serverId}  {status}  {details}',
  'agent.terminal.mcp.usage':
    'Usage: /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
  'agent.terminal.mcp.tools.empty': 'No MCP tools.',
  'agent.terminal.mcp.tools.emptyScoped': 'No MCP tools for {serverId}.',
  'agent.terminal.mcp.tools.header': 'MCP Tools:',
  'agent.terminal.mcp.tools.headerScoped': 'MCP Tools for {serverId}:',
  'agent.terminal.mcp.tools.row': '  {tool}',
  'agent.terminal.mcp.connected': 'MCP server connected: {serverId}',
  'agent.terminal.mcp.disconnected': 'MCP server disconnected: {serverId}',
  'agent.terminal.mcp.reconnected': 'MCP server reconnected: {serverId}',
  'agent.terminal.value.mcpStatus.disabled': 'disabled',
  'agent.terminal.value.mcpStatus.connected': 'connected',
  'agent.terminal.value.mcpStatus.disconnected': 'disconnected',
  'agent.terminal.value.unknown': 'unknown',
  'agent.terminal.diagnostic.mcp.unavailable': 'MCP controls are not available for this session.',
  'agent.terminal.diagnostic.mcp.tools-unavailable':
    'MCP tool listing is not available for this session.',
  'agent.terminal.diagnostic.mcp.usage':
    'Usage: /mcp status | /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
  'agent.terminal.diagnostic.mcp.unknown-server': 'Unknown MCP server: {serverId}',
  'agent.terminal.diagnostic.mcp.server-disabled': 'MCP server is disabled: {serverId}',
  'agent.terminal.diagnostic.mcp.connect-unavailable':
    'MCP connect is not available for this session.',
  'agent.terminal.diagnostic.mcp.disconnect-unavailable':
    'MCP disconnect is not available for this session.',
  'agent.terminal.diagnostic.mcp.reconnect-unavailable':
    'MCP reconnect is not available for this session.',
  'agent.terminal.diagnostic.mcp.unknown-command':
    'Unknown MCP command: {command}. Usage: /mcp status | /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
  'agent.terminal.diagnostic.mcp.operation-failed': 'MCP operation failed: {detail}',
  'agent.terminal.capability.providers.empty': 'No TUI capability providers registered.',
  'agent.terminal.capability.providers.header': 'TUI Capability Providers:',
  'agent.terminal.capability.providers.row':
    '  {providerId}  {state}  loaded={loadedCount} skipped={skippedCount}',
  'agent.terminal.capability.usage':
    'Usage: /capability show <providerId> | /capability tools [providerId]',
  'agent.terminal.capability.provider.header': 'Capability Provider: {providerId}',
  'agent.terminal.capability.provider.version': 'Version: {version}',
  'agent.terminal.capability.provider.loaded': 'Loaded:',
  'agent.terminal.capability.provider.loadedRow': '  {kind}  {name}',
  'agent.terminal.capability.provider.skipped': 'Skipped:',
  'agent.terminal.capability.tools.empty': 'No capability tools.',
  'agent.terminal.capability.tools.emptyScoped': 'No capability tools for {providerId}.',
  'agent.terminal.capability.tools.header': 'Capability Tools:',
  'agent.terminal.capability.tools.headerScoped': 'Capability Tools for {providerId}:',
  'agent.terminal.capability.tools.row': '  {tool}',
  'agent.terminal.capability.diagnostics.empty': 'No capability diagnostics.',
  'agent.terminal.capability.diagnostics.header': 'Capability Diagnostics:',
  'agent.terminal.capability.diagnostics.row': '  {level} {providerId} {kind}: {reason}',
  'agent.terminal.capability.diagnostics.rowWithName':
    '  {level} {providerId} {kind} {name}: {reason}',
  'agent.terminal.capability.diagnostics.rowWithRequirement':
    '  {level} {providerId} {kind}: {reason} requirement={requirement}',
  'agent.terminal.capability.diagnostics.rowWithNameAndRequirement':
    '  {level} {providerId} {kind} {name}: {reason} requirement={requirement}',
  'agent.terminal.value.capabilityState.loaded': 'loaded',
  'agent.terminal.value.capabilityState.skipped': 'skipped',
  'agent.terminal.value.capabilityState.empty': 'empty',
  'agent.terminal.value.noneIndented': '  (none)',
  'agent.terminal.diagnostic.capability.unavailable':
    'Capability diagnostics are not available for this session.',
  'agent.terminal.diagnostic.capability.show-usage': 'Usage: /capability show <providerId>',
  'agent.terminal.diagnostic.capability.unknown-provider':
    'Unknown capability provider: {providerId}',
  'agent.terminal.diagnostic.capability.unknown-command':
    'Unknown capability command: {command}. Usage: /capability list | /capability show <providerId> | /capability tools [providerId]',
  'agent.terminal.artifact.list.empty': 'No artifact references.',
  'agent.terminal.artifact.list.row': '{id}  {kind}',
  'agent.terminal.artifact.list.rowWithDetails': '{id}  {kind}  {details}',
  'agent.terminal.artifact.kind.image': 'Image reference',
  'agent.terminal.artifact.kind.video': 'Video reference',
  'agent.terminal.artifact.kind.audio': 'Audio reference',
  'agent.terminal.artifact.kind.document': 'Document reference',
  'agent.terminal.artifact.kind.artifact': 'Artifact reference',
  'agent.terminal.artifact.kind.unknown': 'Unknown reference',
  'agent.terminal.artifact.field.ref': '- ref: {value}',
  'agent.terminal.artifact.field.asset': '- asset: {value}',
  'agent.terminal.artifact.field.artifact': '- artifact: {value}',
  'agent.terminal.artifact.field.task': '- task: {value}',
  'agent.terminal.artifact.field.tool': '- tool: {value}',
  'agent.terminal.artifact.field.file': '- file: {value}',
  'agent.terminal.artifact.field.size': '- size: {value}',
  'agent.terminal.artifact.field.duration': '- duration: {value}',
  'agent.terminal.artifact.field.probe': '- probe: {value}',
  'agent.terminal.artifact.externalDiagnostic': '! {detail}',
  'agent.terminal.artifact.commands.header': 'Commands:',
  'agent.terminal.artifact.commands.row': '  {command}',
  'agent.terminal.artifact.opened': 'Artifact open requested: {artifactId}',
  'agent.terminal.artifact.sent': 'Artifact {artifactId} sent to {target}',
  'agent.terminal.diagnostic.artifact.unavailable':
    'Artifact controls are not available for this session.',
  'agent.terminal.diagnostic.artifact.list-unavailable':
    'Artifact listing is not available for this session.',
  'agent.terminal.diagnostic.artifact.show-usage': 'Usage: /artifact show <id>',
  'agent.terminal.diagnostic.artifact.show-unavailable':
    'Artifact details are not available for this session.',
  'agent.terminal.diagnostic.artifact.unknown-reference':
    'Unknown artifact reference: {artifactId}',
  'agent.terminal.diagnostic.artifact.open-usage': 'Usage: /artifact open <id>',
  'agent.terminal.diagnostic.artifact.open-unavailable':
    'Artifact open is not available for this session.',
  'agent.terminal.diagnostic.artifact.send-usage': 'Usage: /artifact send <target> <id>',
  'agent.terminal.diagnostic.artifact.send-unavailable':
    'Artifact send is not available for this session.',
  'agent.terminal.diagnostic.artifact.unknown-command':
    'Unknown artifact command: {command}. Usage: /artifact list | /artifact show <id> | /artifact open <id> | /artifact send <target> <id>',
  'agent.terminal.model.status.header': 'Model Selection:',
  'agent.terminal.model.status.current': 'Current chat model: {modelId}',
  'agent.terminal.model.status.available': 'Available chat models:',
  'agent.terminal.model.status.option': '  {modelId}  {label}',
  'agent.terminal.model.status.optionCurrent': '* {modelId}  {label}',
  'agent.terminal.model.selected': 'Chat model switched to: {modelId}',
  'agent.terminal.model.menu.title': 'Chat Model',
  'agent.terminal.model.status.usage.chat':
    'Usage: /model chat <provider:model|provider/model|model-id>',
  'agent.terminal.model.status.usage.media':
    '       /model <image|video|audio> <provider:model|provider/model|model-id|none>',
  'agent.terminal.model.status.usage.perception':
    '       /model perception <image|video|audio> <provider:model|provider/model|model-id|auto>',
  'agent.terminal.media.status.header': 'Media Model Selection:',
  'agent.terminal.media.status.category': '{category}: {modelId} [{source}]',
  'agent.terminal.media.status.available': 'Available {category} models:',
  'agent.terminal.media.status.usage.all':
    'Usage: /media <image|video|audio> <provider:model|provider/model|model-id|none> | /media reset',
  'agent.terminal.media.status.usage.category':
    'Usage: /media <image|video|audio> <provider:model|provider/model|model-id|none>',
  'agent.terminal.media.selected': '{category} model set to: {modelId}',
  'agent.terminal.media.disabled': '{category} media generation disabled for this session.',
  'agent.terminal.media.reset': 'Media model overrides reset to config defaults.',
  'agent.terminal.media.menu.title': '{category} Model',
  'agent.terminal.media.menu.none.label': 'None',
  'agent.terminal.media.menu.none.description': 'Disable {category} generation for this session',
  'agent.terminal.perception.status.header': 'Perception Models:',
  'agent.terminal.perception.status.category': '{category}: {modelId}',
  'agent.terminal.perception.status.available': 'Available {category} perception models:',
  'agent.terminal.perception.status.usage.all':
    'Usage: /perception <image|video|audio> <provider:model|provider/model|model-id|auto> | /perception reset',
  'agent.terminal.perception.status.usage.category':
    'Usage: /perception <image|video|audio> <provider:model|provider/model|model-id|auto>',
  'agent.terminal.perception.selected': '{category} perception model set to: {modelId}',
  'agent.terminal.perception.automatic': '{category} perception model set to automatic selection.',
  'agent.terminal.perception.reset': 'Perception model overrides reset to automatic selection.',
  'agent.terminal.perception.menu.title': '{category} Perception Model',
  'agent.terminal.perception.menu.auto.label': 'Auto',
  'agent.terminal.perception.menu.auto.description':
    'Use automatic {category} perception model selection',
  'agent.terminal.diagnostic.model.unknown':
    'Unknown chat model identity: {modelId}. Use /model chat to list available chat models.',
  'agent.terminal.diagnostic.model.unavailable':
    'Chat model selection is not available for this session.',
  'agent.terminal.diagnostic.model.operationFailed': 'Failed to select the chat model.',
  'agent.terminal.diagnostic.media.unknown':
    'Unknown {category} media model identity: {modelId}. Use /media {category} to list available models.',
  'agent.terminal.diagnostic.media.unavailable':
    'Media model selection is not available for this session.',
  'agent.terminal.diagnostic.media.categoryUnknown':
    'Unknown media category. Valid values: image, video, audio, reset.',
  'agent.terminal.diagnostic.media.resetUnavailable':
    'Media model reset is not available for this session.',
  'agent.terminal.diagnostic.media.resetFailed': 'Failed to reset media models.',
  'agent.terminal.diagnostic.media.operationFailed': 'Failed to update the {category} media model.',
  'agent.terminal.diagnostic.perception.unknown':
    'Unknown {category} perception model identity: {modelId}. Use /perception {category} to list available models.',
  'agent.terminal.diagnostic.perception.unavailable':
    'Perception model selection is not available for this session.',
  'agent.terminal.diagnostic.perception.categoryUnknown':
    'Unknown perception category. Valid values: image, video, audio, reset.',
  'agent.terminal.diagnostic.perception.resetUnavailable':
    'Perception model reset is not available for this session.',
  'agent.terminal.diagnostic.perception.resetFailed': 'Failed to reset perception models.',
  'agent.terminal.diagnostic.perception.operationFailed':
    'Failed to update the {category} perception model.',
  'agent.terminal.value.mediaCategoryTitle.image': 'Image',
  'agent.terminal.value.mediaCategoryTitle.video': 'Video',
  'agent.terminal.value.mediaCategoryTitle.audio': 'Audio',
  'agent.terminal.value.model.none': '(none)',
  'agent.terminal.value.model.auto': 'auto',
  'agent.terminal.value.modelSource.sessionOverride': 'session override',
  'agent.terminal.value.modelSource.configDefault': 'config default',
  'agent.terminal.value.modelSource.notSet': 'not set',
  'agent.terminal.status.model': 'Model: {modelId}',
  'agent.terminal.status.session': 'Session: {sessionMode}',
  'agent.terminal.status.mode': 'Mode: {executionMode}',
  'agent.terminal.status.state': 'Status: {status}',
  'agent.terminal.status.mediaModel': 'Media ({category}): {modelId}',
  'agent.terminal.status.perceptionModel': 'Perception ({category}): {modelId}',
  'agent.terminal.status.parameter': 'Parameter ({name}): {value}',
  'agent.terminal.status.tokens': 'Tokens: {count}',
  'agent.terminal.status.contextTokens': 'Context tokens: {count}',
  'agent.terminal.status.skills.none': 'Skills: none',
  'agent.terminal.status.skills.one': 'Skills: {count} active',
  'agent.terminal.status.skills.many': 'Skills: {count} active',
  'agent.terminal.status.queue': 'Queue: {count}',
  'agent.terminal.status.task': 'Task: {taskId} ({status})',
  'agent.terminal.status.config': 'User config: {path}',
  'agent.terminal.value.taskStatus.pending': 'pending',
  'agent.terminal.value.taskStatus.running': 'running',
  'agent.terminal.value.taskStatus.completed': 'completed',
  'agent.terminal.value.taskStatus.failed': 'failed',
  'agent.terminal.value.taskStatus.cancelled': 'cancelled',
  'agent.terminal.value.agentStatus.idle': 'idle',
  'agent.terminal.value.agentStatus.running': 'running',
  'agent.terminal.value.agentStatus.waitingConfirmation': 'waiting for confirmation',
  'agent.terminal.value.agentStatus.error': 'error',
  'agent.terminal.value.executionMode.plan': 'plan',
  'agent.terminal.value.executionMode.ask': 'ask',
  'agent.terminal.value.executionMode.auto': 'auto',
  'agent.terminal.value.sessionMode.agent': 'agent',
  'agent.terminal.value.sessionMode.image': 'image',
  'agent.terminal.value.sessionMode.video': 'video',
  'agent.terminal.value.sessionMode.audio': 'audio',
  'agent.terminal.chrome.model': 'Model',
  'agent.terminal.chrome.workDir': 'WorkDir',
  'agent.terminal.chrome.mode': 'Mode',
  'agent.terminal.chrome.chat': 'chat',
  'agent.terminal.chrome.media': 'media',
  'agent.terminal.chrome.perception': 'perception',
  'agent.terminal.chrome.none': 'none',
  'agent.terminal.chrome.skill': 'skill',
  'agent.terminal.chrome.skills': 'skills',
  'agent.terminal.chrome.queue': 'queue',
  'agent.terminal.chrome.task': 'task',
  'agent.terminal.chrome.locked': 'locked',
  'agent.terminal.chrome.more': 'more',
  'agent.terminal.chrome.multiLineHint': '[multi-line: Shift+Enter for newline]',
  'agent.terminal.chrome.selectionHint': '↑↓:navigate Enter:select Esc:cancel',
  'agent.terminal.chrome.noMatchingCommands': 'No matching commands',
  'agent.terminal.chrome.startupHelp': 'Type /help for commands, /exit to quit',
  'agent.terminal.stageGuardian.stageOutOfOrder':
    '[{code}] Entered Apply without visiting Draft / Plan first; high-risk tool calls should traverse the earlier stages per ADR §3.2.',
  'agent.terminal.stageGuardian.stageTimeout':
    '[{code}] Stage "{stage}" has been active for {elapsedMs} ms, exceeding the {budgetMs} ms budget.',
  'agent.terminal.stageGuardian.approvalSkipped':
    '[{code}] Apply was committed for subject "{subject}" without a prior approval decision.',
  'agent.terminal.activity.processing': 'Processing',
  'agent.terminal.activity.processingWithIteration': 'Processing ({current}/{max})',
  'agent.terminal.activity.processingWithElapsed': 'Processing {duration}',
  'agent.terminal.activity.processingWithIterationAndElapsed':
    'Processing ({current}/{max}) {duration}',
  'agent.terminal.activity.thinking': 'Thinking…',
  'agent.terminal.activity.thinkingWithElapsed': 'Thinking… (thought for {duration})',
  'agent.terminal.activity.generating': 'Generating',
  'agent.terminal.activity.generatingWithElapsed': 'Generating {duration}',
  'agent.terminal.activity.thinkingBlock.active': 'Thinking...',
  'agent.terminal.activity.thinkingBlock.thoughtOne': '* Thought for {count} line',
  'agent.terminal.activity.thinkingBlock.thoughtMany': '* Thought for {count} lines',
  'agent.terminal.activity.thinkingBlock.moreOne': '... {count} more line',
  'agent.terminal.activity.thinkingBlock.moreMany': '... {count} more lines',
  'agent.terminal.timeline.fallback.tool': 'tool',
  'agent.terminal.timeline.fallback.task': 'task',
  'agent.terminal.timeline.fallback.media': 'media',
  'agent.terminal.timeline.fallback.error': 'Timeline error',
  'agent.terminal.timeline.result.failed': 'failed',
  'agent.terminal.timeline.result.attachments': 'attachments={count}',
  'agent.terminal.timeline.result.perceptionCards': 'perception={count}',
  'agent.terminal.timeline.result.artifacts': 'artifacts={count}',
  'agent.terminal.timeline.backfill.keys': 'patched {keys}',
  'agent.terminal.timeline.backfill.empty': 'patched result',
  'agent.terminal.timeline.compositeReference':
    'Composite content is available through its terminal reference.',
  'agent.terminal.timeline.diagnostic.missingToolCall':
    'tool_call event is missing its toolCall payload.',
  'agent.terminal.timeline.diagnostic.missingToolAnchor':
    '{event} event is missing its tool anchor.',
  'agent.terminal.timeline.diagnostic.unknownToolAnchor':
    '{event} event references an unknown tool.',
  'agent.terminal.timeline.diagnostic.itemKindMismatch': 'Timeline item kind changed unexpectedly.',
  'agent.terminal.timeline.diagnostic.appendNonTextItem': 'Timeline append requires a text item.',
  'agent.terminal.timeline.diagnostic.sourceGenerationMismatch':
    'Timeline append source generation does not match.',
  'agent.terminal.timeline.diagnostic.completeMissingItem':
    'Timeline completion references an unknown text item.',
  'agent.terminal.timeline.diagnostic.completeIdentityMismatch':
    'Timeline completion identity does not match.',
  'agent.terminal.timeline.diagnostic.duplicateItemRevision':
    'Timeline item revision was already applied.',
  'agent.terminal.timeline.diagnostic.staleItemRevision': 'Timeline item revision is stale.',
  'agent.terminal.timeline.diagnostic.unknownParentItem':
    'Timeline item references an unknown parent item.',
  'agent.terminal.approval.required': 'Tool Approval Required',
  'agent.terminal.approval.yes': 'yes',
  'agent.terminal.approval.no': 'no',
  'agent.terminal.approval.always': 'always',
  'agent.terminal.approval.moreLines.one': '... {count} more line',
  'agent.terminal.approval.moreLines.many': '... {count} more lines',
  'agent.terminal.approval.cwd': 'cwd: {cwd}',
  'agent.terminal.queue.nextTurn': 'Next turn',
  'agent.terminal.queue.userMessage': 'message',
  'agent.terminal.queue.taskContinuation': 'task continuation',
  'agent.terminal.queue.subagentContinuation': 'subagent continuation',
  'agent.terminal.queue.systemContinuation': 'system continuation',
  'agent.terminal.queue.continuationPriority': 'internal continuation first',
  'agent.terminal.queue.moreItems': 'more',
  'agent.terminal.queue.commandHint': 'Use /queue list to inspect or manage pending messages',
  'agent.terminal.queue.sendNext': 'Send next',
  'agent.terminal.queue.nextUserMessage': 'Next user message',
  'agent.terminal.queue.edit': 'Edit',
  'agent.terminal.queue.cancel': 'Cancel',
  'agent.terminal.queue.pausedAfterCancel': 'Queue paused after cancellation',
  'agent.terminal.queue.keyboardActions': 'Queue shortcuts',
  'agent.terminal.value.mediaCategory.image': 'image',
  'agent.terminal.value.mediaCategory.video': 'video',
  'agent.terminal.value.mediaCategory.audio': 'audio',
  'agent.terminal.value.mediaCategory.sequence': 'sequence',
  'agent.terminal.value.mediaCategory.text': 'text',
  'agent.terminal.value.mediaCategory.document': 'document',
  'agent.terminal.value.referenceSource.workspaceFile': 'workspace file',
  'agent.terminal.value.referenceSource.generatedAssets': 'generated-assets',
  'agent.terminal.value.referenceSource.mediaLibrary': 'media-library',
  'agent.terminal.value.referenceSource.entityGraph': 'entity-graph',
  'agent.terminal.value.referenceSource.story': 'story',
  'agent.terminal.value.referenceSource.canvas': 'canvas',
  'agent.terminal.value.suggestionKind.command': 'command',
  'agent.terminal.value.suggestionKind.skill': 'skill',
  'agent.terminal.value.suggestionKind.file': 'file',
  'agent.terminal.value.suggestionKind.asset': 'asset',
  'agent.terminal.value.suggestionKind.media': 'media',
  'agent.terminal.value.suggestionKind.entity': 'entity',
  'agent.terminal.value.suggestionKind.canvasNode': 'canvas-node',
  'agent.terminal.value.suggestionKind.character': 'character',
  'agent.terminal.value.suggestionKind.scene': 'scene',
  'agent.terminal.config.status.header': 'Current Configuration:',
  'agent.terminal.config.status.field.provider': 'Provider',
  'agent.terminal.config.status.field.model': 'Model',
  'agent.terminal.config.status.field.apiKey': 'API Key',
  'agent.terminal.config.status.field.baseUrl': 'Base URL',
  'agent.terminal.config.status.field.maxOutputTokens': 'Max Output Tokens',
  'agent.terminal.config.status.field.temperature': 'Temperature',
  'agent.terminal.config.status.field.verbose': 'Verbose',
  'agent.terminal.config.status.field.outputFormat': 'Output Format',
  'agent.terminal.config.status.field.workDir': 'Work Dir',
  'agent.terminal.config.status.field.mcpServers': 'MCP Servers',
  'agent.terminal.config.status.row': '  {name}: {value}',
  'agent.terminal.config.status.usage.set': 'Use "/config set <key> <value>" to change a setting.',
  'agent.terminal.config.status.usage.providers':
    'Use "/config providers" to list available providers.',
  'agent.terminal.config.status.usage.models': 'Use "/config models" to list available models.',
  'agent.terminal.config.updated': 'Set {key} = {value}',
  'agent.terminal.config.providers.header': 'Available Providers:',
  'agent.terminal.config.providers.row': '  {providerId} ({displayName})',
  'agent.terminal.config.providers.type': '    Type: {type}',
  'agent.terminal.config.providers.apiKey': '    API Key: {state}',
  'agent.terminal.config.providers.models': '    Models: {models}',
  'agent.terminal.config.models.header': 'Available Models for {providerId}:',
  'agent.terminal.config.models.row': '    {modelId}',
  'agent.terminal.config.models.rowCurrent': '  * {modelId}',
  'agent.terminal.config.models.currentHint': '(* = current model)',
  'agent.terminal.value.notSet': '(not set)',
  'agent.terminal.value.none': '(none)',
  'agent.terminal.resume.resumedOne': 'Resumed: "{title}" ({messageCount} message, {updatedAt})',
  'agent.terminal.resume.resumedMany': 'Resumed: "{title}" ({messageCount} messages, {updatedAt})',
  'agent.terminal.resume.empty': 'No saved conversations found for this workspace.',
  'agent.terminal.resume.header': 'Saved Conversations:',
  'agent.terminal.resume.row': '  [{index}] {title}',
  'agent.terminal.resume.rowCurrent': '  [{index}] {title} (current)',
  'agent.terminal.resume.summaryOne':
    '      id: {conversationId} · {updatedAt} · {messageCount} message',
  'agent.terminal.resume.summaryMany':
    '      id: {conversationId} · {updatedAt} · {messageCount} messages',
  'agent.terminal.resume.usage': 'Use "/resume <id>" to restore a conversation.',
  'agent.terminal.history.empty': 'No messages in current session.',
  'agent.terminal.history.headerOne': 'Conversation History ({messageCount} message):',
  'agent.terminal.history.headerMany': 'Conversation History ({messageCount} messages):',
  'agent.terminal.history.row': '  [{index}] {role}: {preview}',
  'agent.terminal.history.role.user': 'You',
  'agent.terminal.history.role.assistant': 'Assistant',
  'agent.terminal.history.role.tool': 'Tool',
  'agent.terminal.history.structured': '[tool/structured]',
  'agent.terminal.diagnostic.config.setUsage': 'Usage: /config set <key> <value>',
  'agent.terminal.diagnostic.config.invalidKey':
    'Invalid key: {key}. Valid keys: provider, model, maxTokens, temperature, verbose, outputFormat',
  'agent.terminal.diagnostic.config.invalidMaxTokens': 'maxTokens must be a number',
  'agent.terminal.diagnostic.config.invalidTemperature':
    'temperature must be a number between 0 and 2',
  'agent.terminal.diagnostic.config.invalidOutputFormat':
    'outputFormat must be text, json, or markdown',
  'agent.terminal.diagnostic.config.updateUnavailable':
    'Configuration updates are not available for this session.',
  'agent.terminal.diagnostic.config.modelsEmpty': 'No models configured for provider: {providerId}',
  'agent.terminal.diagnostic.config.unknownCommand':
    'Unknown config subcommand: {command}. Use /config, /config set, /config providers, or /config models',
  'agent.terminal.diagnostic.resume.unavailable': 'Conversation storage is not available.',
  'agent.terminal.diagnostic.resume.notFound': 'Conversation "{conversationId}" was not found.',
  'agent.terminal.diagnostic.resume.storageFailed': 'Failed to read conversation storage: {detail}',
  'agent.terminal.diagnostic.history.unavailable': 'History is not available.',
  'agent.terminal.value.done': 'done',
  'agent.terminal.markdown.fatalTitle': 'Markdown rendering failed',
  'agent.terminal.markdown.syntheticColumn': 'Column {index}',
  'agent.terminal.markdown.unresolved': 'unresolved: {label}',
  'agent.terminal.markdown.image': 'image: {alt}',
  'agent.terminal.markdown.linkTarget': 'target: {target}',
  'agent.terminal.markdown.unsafeControl': 'unsafe terminal control {control}',
  'agent.terminal.markdown.unsupportedDestination': 'unsupported destination: {target}',
  'agent.terminal.markdown.tableGridBudgetExceeded':
    'table grid budget exceeded ({cells} cells); using record layout',
  'agent.terminal.markdown.highlightLimitExceeded':
    'syntax highlighting limit exceeded; showing complete plain code',
} as const;

export type CliTerminalMessageKey = keyof typeof CLI_TERMINAL_MESSAGES_EN;
export type AgentTerminalMessageKey = CliTerminalMessageKey | AgentCommandMessageKey;

const CLI_TERMINAL_MESSAGES_ZH_CN = {
  'agent.terminal.commander.section.usage': '用法：',
  'agent.terminal.commander.section.arguments': '参数：',
  'agent.terminal.commander.section.options': '选项：',
  'agent.terminal.commander.section.globalOptions': '全局选项：',
  'agent.terminal.commander.section.commands': '命令：',
  'agent.terminal.commander.defaultValue': '{description}（默认值：{value}）',
  'agent.terminal.commander.helpOption': '显示命令帮助',
  'agent.terminal.commander.helpCommand': '显示命令帮助',
  'agent.terminal.commander.versionOption': '输出版本号',
  'agent.terminal.commander.program.description': 'OpenNeko AI Agent — 专业终端界面',
  'agent.terminal.commander.command.interactive': '启动交互式 TUI 模式',
  'agent.terminal.commander.command.image': '不经过 Agent 直接生成图像',
  'agent.terminal.commander.command.video': '不经过 Agent 直接生成视频',
  'agent.terminal.commander.command.audio': '不经过 Agent 直接生成音频',
  'agent.terminal.commander.command.resume': '恢复之前的交互会话',
  'agent.terminal.commander.command.completion': '生成 shell 补全脚本',
  'agent.terminal.commander.command.config': '管理配置',
  'agent.terminal.commander.command.configShow': '显示当前配置',
  'agent.terminal.commander.command.configProviders': '列出可用提供者',
  'agent.terminal.commander.command.configModels': '列出当前提供者的可用模型',
  'agent.terminal.commander.command.debug': '本地开发自动化与诊断',
  'agent.terminal.commander.command.debugAutomation': '为完整 TUI 会话启动本地开发自动化协议',
  'agent.terminal.commander.argument.initialPrompt': '启动会话时可选提交的用户提示词',
  'agent.terminal.commander.argument.workDir': '工作区配置和文件工具使用的工作目录',
  'agent.terminal.commander.argument.startupPrompt': '启动后可选提交的用户提示词',
  'agent.terminal.commander.argument.resumeId': '要恢复的对话 ID；省略则继续最近的对话',
  'agent.terminal.commander.argument.resumePrompt': '恢复后可选提交的提示词',
  'agent.terminal.commander.argument.shell': 'Shell 类型（bash、zsh、fish）',
  'agent.terminal.commander.argument.mediaPrompt': '媒体生成提示词',
  'agent.terminal.commander.option.workDir': '工作区配置和文件工具使用的工作目录',
  'agent.terminal.commander.option.workspaceConfigWorkDir': '工作区配置使用的工作目录',
  'agent.terminal.commander.option.provider': 'AI 提供者（anthropic、openai、deepseek）',
  'agent.terminal.commander.option.model': '模型 ID',
  'agent.terminal.commander.option.mediaModel': '媒体模型 ID 或 provider:model 身份',
  'agent.terminal.commander.option.json': '输出结构化 JSON',
  'agent.terminal.commander.option.apiKey': 'API 密钥',
  'agent.terminal.commander.option.verbose': '启用详细输出',
  'agent.terminal.commander.option.uiLocale': '终端语言（auto、en、zh-cn）',
  'agent.terminal.commander.option.promptLocale': '内置 Agent 提示词语言（auto、en、zh-cn）',
  'agent.terminal.commander.option.resume': '恢复之前的对话（省略 ID 则继续最近的对话）',
  'agent.terminal.commander.option.last': '继续最近的对话',
  'agent.terminal.commander.option.configProvider': '要列出模型的提供者',
  'agent.terminal.commander.option.stdio': '通过 stdio 使用换行分隔的 JSON',
  'agent.terminal.commander.diagnostic.missingArgument': '错误：缺少必需参数“{name}”',
  'agent.terminal.commander.diagnostic.optionMissingArgument': '错误：选项“{flags}”缺少参数',
  'agent.terminal.commander.diagnostic.missingRequiredOption': '错误：未指定必需选项“{flags}”',
  'agent.terminal.commander.diagnostic.unknownOption': '错误：未知选项“{flag}”',
  'agent.terminal.commander.diagnostic.excessArguments':
    '错误：命令 {command} 的参数过多。预期 {expected} 个，实际 {received} 个。',
  'agent.terminal.commander.diagnostic.unknownCommand': '错误：未知命令“{command}”',
  'agent.terminal.directMedia.completed': '{kind} 生成已完成：{taskScope}（{model}）',
  'agent.terminal.directMedia.diagnostic.direct-media-empty-prompt':
    '直接媒体生成需要非空提示词。{detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-model-unavailable':
    '直接媒体模型不可用。{detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-model-kind-mismatch':
    '直接媒体模型类别与命令不匹配。{detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-task-failed':
    '直接媒体任务失败（{taskScope}）。{detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-task-cancelled':
    '直接媒体任务已取消（{taskScope}）。{detail}',
  'agent.terminal.directMedia.diagnostic.direct-media-result-unavailable':
    '直接媒体任务完成但没有稳定结果（{taskScope}）。{detail}',
  'agent.terminal.cli.configLoad.missingDefaultProvider':
    '未在 ~/.neko/config.toml 中配置默认提供方。',
  'agent.terminal.cli.configLoad.providerNotConfigured':
    '提供方“{providerId}”未在 ~/.neko/config.toml 中配置。',
  'agent.terminal.cli.configLoad.missingProviderModel': '未为提供方“{providerId}”配置模型。',
  'agent.terminal.cli.configLoad.empty': '配置文件为空：{path}。请修复后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.invalidToml':
    '配置文件包含无效 TOML：{path}。请修复后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedVersion':
    '配置文件使用了不支持的版本：{path}。请更新 OpenNeko 或迁移文件，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedProviderType':
    '配置文件包含不支持的提供方类型：{path}。请改用受支持的类型，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedProviderConnectionKind':
    '配置文件包含不支持的 provider connection_kind：{path}。请使用 gateway、local 或 direct，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedProviderProtocolProfile':
    '配置文件包含不支持的 provider protocol_profile：{path}。请改用受支持的协议配置，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedProviderSupportLevel':
    '配置文件包含不支持的 provider support_level：{path}。请使用 verified、compatible、experimental 或 custom，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedProtocolAuthType':
    '配置文件包含不支持的 protocol_variant auth_type：{path}。请使用 bearer、api-key 或 custom-header，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedProtocolStreamFormat':
    '配置文件包含不支持的 protocol_variant stream_format：{path}。请使用 sse 或 ndjson，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedModelProtocolProfile':
    '配置文件包含不支持的 model protocol_profile：{path}。请改用受支持的协议配置，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedModelProtocol':
    '配置文件包含不支持的 model protocol：{path}。请通过受支持的提供方类型覆盖协议，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.duplicateProviderId':
    '配置文件包含重复的提供方 ID：{path}。请删除重复项，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.duplicateModelId':
    '配置文件包含重复的模型 ID：{path}。请删除重复项，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.invalidDefaultMaxTokens':
    '配置文件中的 defaults.max_tokens 无效：{path}。请使用正整数，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.invalidModelTokenMetadata':
    '配置文件包含无效的模型 token 元数据：{path}。请为上下文和输出 token 限制使用正整数，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedProfileSchemaSection':
    '配置文件包含不支持的 Agent profile schema 区段：{path}。请改为安装 Agent profile 包，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedModelType':
    '配置文件包含不支持的模型类型：{path}。请使用 llm、image、video 或 audio，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedDefaultMediaModelType':
    '配置文件包含已废弃的 default_media_models：{path}。请迁移到 default_models，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedDefaultModelType':
    '配置文件包含不支持的 default_models 键：{path}。请使用 llm、image、video 或 audio，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedDefaultModelPurpose':
    '配置文件包含无效的 default_model_purposes 项：{path}。请使用 provider_id 和 model_id，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.readError':
    '无法读取配置文件：{path}。请检查文件权限，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.missingConfig':
    '缺少 Agent 配置文件：{path}。请创建配置并启用提供方与聊天模型，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.missingProvider':
    'Agent 配置没有已启用的提供方：{path}。请添加并启用提供方，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.missingModel':
    'Agent 配置没有已启用的聊天模型：{path}。请添加并启用聊天模型，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.missingApiKey':
    'Agent 配置没有可用的聊天提供方：{path}。请补充所需端点和凭据，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.invalidDefaultProvider':
    'Agent 配置选择了不可用的默认提供方：{path}。请修复 default_provider，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.invalidDefaultModel':
    'Agent 配置选择了不可用的默认聊天模型：{path}。请修复 default_model，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.invalidDefaultModelBinding':
    '配置包含不可用或能力不匹配的默认模型绑定：{path}。请修复绑定，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedWorkspaceProviderDefinition':
    '工作区配置定义了提供方：{path}。请将提供方定义和凭据移到用户配置，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedWorkspaceModelDefinition':
    '工作区配置定义了模型：{path}。请将模型定义移到用户配置或账号目录，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.unsupportedSkillSource':
    '配置引用了非标准 Skill 来源：{path}。请使用 .agents/skills、.neko/commands 或显式来源提供方。',
  'agent.terminal.cli.configLoad.missingAccountCatalog':
    'Neko 账号 AI 目录不可用。请登录或配置本地 AI 提供方，然后重启 Neko Agent。',
  'agent.terminal.cli.configLoad.accountCatalogUnavailable':
    'Neko 账号 AI 目录暂时不可用。请刷新 Agent 或配置本地 AI 提供方。',
  'agent.terminal.cli.configLoad.accountModelNotEntitled':
    '当前 Neko 账号权益不包含所选 AI 模型。请选择其他模型或更新方案。',
  'agent.terminal.cli.validation.header': '配置错误：',
  'agent.terminal.cli.validation.missingApiKey':
    '未找到提供方“{providerId}”的 API 密钥。请使用 --api-key、对应提供方的环境变量或 ~/.neko/config.toml 进行配置。',
  'agent.terminal.cli.validation.missingModel':
    '必须指定模型。请使用 --model 或在 ~/.neko/config.toml 中配置。',
  'agent.terminal.cli.validation.invalidTemperature':
    'Temperature 必须在 0 到 2 之间；收到 {value}。',
  'agent.terminal.cli.validation.invalidMaxTokens': 'maxTokens 必须是正整数；收到 {value}。',
  'agent.terminal.cli.validation.invalidOutputFormat':
    'outputFormat 必须是 text、json 或 markdown；收到“{value}”。',
  'agent.terminal.cli.validation.apiKeyHint': '请设置 API 密钥：',
  'agent.terminal.cli.validation.apiKeyExport': '  export ANTHROPIC_API_KEY=sk-ant-...',
  'agent.terminal.cli.validation.or': '  # 或',
  'agent.terminal.cli.validation.configUpdate': '  更新 ~/.neko/config.toml',
  'agent.terminal.cli.diagnostic.resumeNotFound': '工作目录中没有已保存的 TUI 对话：{path}',
  'agent.terminal.cli.diagnostic.invalidCompletionShell':
    '无效的 shell“{value}”。应为 bash、zsh 或 fish。',
  'agent.terminal.cli.diagnostic.debugStdioRequired': '调试自动化需要 --stdio 选项。',
  'agent.terminal.cli.locale.invalidPreference':
    '{source} 的 Locale 值无效：{value}。应为 auto、en 或 zh-cn。',
  'agent.terminal.cli.locale.workspaceForbidden':
    '工作区配置不得定义 {key}；Locale 偏好仅允许在用户配置中设置。',
  'agent.terminal.diagnostic.conversation.nonCanonical':
    'TUI 恢复对话 ID 必须是规范 ID；收到 {conversationId}。请开始新的 TUI 对话，或选择当前工作区的规范对话 ID。',
  'agent.terminal.cli.workDir.invalidOptionValue': '{option} 必须是字符串。',
  'agent.terminal.cli.workDir.conflictingPositionalOption':
    '工作目录冲突：位置参数 {positionalPath} 与选项 {optionPath} 不一致',
  'agent.terminal.cli.workDir.conflictingOptions':
    '工作目录冲突：{firstOption} {firstPath} 与 {secondOption} {secondPath} 不一致',
  'agent.terminal.cli.workDir.missingDirectory': '工作目录不存在：{path}',
  'agent.terminal.cli.workDir.notDirectory': '工作目录不是目录：{path}',
  'agent.terminal.suggestion.command.mode': '显示或切换会话模式',
  'agent.terminal.suggestion.command.model': '列出或切换当前对话模型',
  'agent.terminal.suggestion.command.media': '列出或切换图像、视频、音频模型',
  'agent.terminal.suggestion.command.param': '显示或设置 LLM 与媒体参数',
  'agent.terminal.suggestion.command.queue': '列出、提升、取消或编辑队列中的提示',
  'agent.terminal.suggestion.command.mcp': '显示 MCP 服务状态、工具和连接控制',
  'agent.terminal.suggestion.command.capability': '显示 TUI 能力提供者、诊断和工具',
  'agent.terminal.suggestion.command.artifact': '列出、显示、打开或发送终端工件引用',
  'agent.terminal.suggestion.command.compact': '压缩当前 Agent 上下文',
  'agent.terminal.suggestion.command.status': '显示模式、模型、队列、技能、任务和上下文状态',
  'agent.terminal.suggestion.command.auto': '切换到自动执行模式',
  'agent.terminal.suggestion.command.ask': '切换到执行前询问模式',
  'agent.terminal.suggestion.command.skill': '激活或停用技能生命周期记录',
  'agent.terminal.skill.catalogUnavailable': '未从标准 Neko Skill 目录加载技能。',
  'agent.terminal.skill.catalogEmpty': '标准 Neko Skill 目录中没有可用技能。',
  'agent.terminal.skill.deactivationAmbiguous':
    '存在多个活跃的 Skill 生命周期记录。请使用 /skill off <recordId|slot|skillName>。当前记录：{records}',
  'agent.terminal.skill.invoked': '已调用 Skill：{skillName}',
  'agent.terminal.skill.menu.title': '选择 Skill',
  'agent.terminal.skill.menu.deactivate.label': '停用',
  'agent.terminal.skill.menu.deactivate.description': '清除当前活跃 Skill',
  'agent.terminal.diagnostic.skill.notFound': '未找到 Skill：“{skillName}”。使用 /skill 浏览。',
  'agent.terminal.diagnostic.skill.invocationInvalid': '无效的 Skill 调用：{input}',
  'agent.terminal.diagnostic.skill.serviceUnavailable': '当前会话未提供 Skill 服务。',
  'agent.terminal.diagnostic.skill.disabled': 'Skill 已停用：{skillName}',
  'agent.terminal.diagnostic.skill.loadFailed': '加载 Skill 失败：{skillName}',
  'agent.terminal.diagnostic.skill.loadFailedWithDetail': '加载 Skill {skillName} 失败：{detail}',
  'agent.terminal.diagnostic.skill.noContent': 'Skill 没有提示词内容：{skillName}',
  'agent.terminal.diagnostic.skill.invocationFailed': 'Skill 调用失败：{detail}',
  'agent.terminal.diagnostic.command.unknown': '未知命令：{input}。输入 /help 查看可用命令。',
  'agent.terminal.diagnostic.command.failed': '命令执行失败：{detail}',
  'agent.terminal.parameter.status.header': 'LLM 参数：',
  'agent.terminal.parameter.status.row': '  {name}：{value}',
  'agent.terminal.parameter.status.advanced': '  高级参数：',
  'agent.terminal.parameter.status.advancedRow': '    {name}：{value}',
  'agent.terminal.parameter.usage':
    '用法：/param set <reasoning|verbosity|creativity|temperature|topP|maxOutputTokens|reasoningEffort|thinkingBudget|serviceTier> <value>',
  'agent.terminal.parameter.reset': 'LLM 参数已重置。',
  'agent.terminal.parameter.updated': '参数已更新：{name} = {value}',
  'agent.terminal.parameter.applied.header': '已应用参数：',
  'agent.terminal.parameter.applied.row': '  {name} = {value}',
  'agent.terminal.parameter.applied.providerOptions': '  providerOptions = {names}',
  'agent.terminal.parameter.applied.defaults': '已应用提供商默认参数。',
  'agent.terminal.value.default': '（默认）',
  'agent.terminal.diagnostic.parameter.unavailable': '当前会话不支持参数控制。',
  'agent.terminal.diagnostic.parameter.usage':
    '用法：/param set <name> <value> | /param status | /param reset',
  'agent.terminal.diagnostic.parameter.setUsage': '用法：/param set <name> <value>',
  'agent.terminal.diagnostic.parameter.unsupported':
    '不支持的参数：{name}。有效值：reasoning、verbosity、creativity、temperature、topP、maxOutputTokens、reasoningEffort、thinkingBudget、serviceTier',
  'agent.terminal.diagnostic.parameter.invalid-reasoning':
    '无效的 reasoning 预设。有效值：fast、balanced、deep',
  'agent.terminal.diagnostic.parameter.invalid-verbosity-preset':
    '无效的 verbosity 预设。有效值：brief、standard、detailed',
  'agent.terminal.diagnostic.parameter.invalid-creativity':
    '无效的 creativity 预设。有效值：stable、creative、wild',
  'agent.terminal.diagnostic.parameter.numberRange': '{name} 必须是 0 到 2 之间的数字',
  'agent.terminal.diagnostic.parameter.positiveInteger': '{name} 必须是正整数',
  'agent.terminal.diagnostic.parameter.invalid-reasoning-effort':
    '无效的 reasoningEffort。有效值：none、minimal、low、medium、high、xhigh',
  'agent.terminal.diagnostic.parameter.invalid-text-verbosity':
    '无效的 verbosity。有效值：low、medium、high',
  'agent.terminal.diagnostic.parameter.invalid-service-tier':
    '无效的 serviceTier。有效值：auto、default、fast、flex、priority',
  'agent.terminal.diagnostic.parameter.validationFailed': '参数校验失败',
  'agent.terminal.diagnostic.parameter.providerNotConfigured': '提供商 "{providerId}" 未配置。',
  'agent.terminal.diagnostic.parameter.modelNotConfigured': '模型 "{modelId}" 未配置。',
  'agent.terminal.diagnostic.parameter.unsupportedReasoningEffort':
    '所选模型不支持 reasoning effort 参数：{field}',
  'agent.terminal.diagnostic.parameter.unsupportedThinkingBudget':
    '所选模型或提供商不支持 thinking budget 参数：{field}',
  'agent.terminal.diagnostic.parameter.unsupportedVerbosity':
    '所选模型不支持输出 verbosity 参数：{field}',
  'agent.terminal.diagnostic.parameter.unsupportedTemperature':
    '所选模型不支持 temperature 参数：{field}',
  'agent.terminal.diagnostic.parameter.unsupportedTopP': '所选模型不支持 topP 参数：{field}',
  'agent.terminal.diagnostic.parameter.unsupportedFastTier':
    '所选模型或提供商不支持 fast service tier：{field}',
  'agent.terminal.diagnostic.parameter.unsupportedServiceTier':
    '所选提供商不支持请求的 service tier：{field}',
  'agent.terminal.diagnostic.parameter.unsupportedMaxOutputTokens':
    '所选模型不支持 max output tokens 参数：{field}',
  'agent.terminal.diagnostic.parameter.invalidAnthropicThinkingSampling':
    'Anthropic thinking 请求不能包含 sampling 参数：{field}',
  'agent.terminal.lifecycle.goodbye': '再见！',
  'agent.terminal.history.cleared': '历史记录已清除。',
  'agent.terminal.sessionMode.current': '会话模式：{mode}',
  'agent.terminal.sessionMode.available': '可用模式：{modes}',
  'agent.terminal.sessionMode.usage': '用法：/mode agent|image|video|audio',
  'agent.terminal.sessionMode.selected': '会话模式已设为：{mode}',
  'agent.terminal.executionMode.plan': '已启用规划模式',
  'agent.terminal.executionMode.ask': '已启用询问模式',
  'agent.terminal.executionMode.auto': '已启用自动模式',
  'agent.terminal.context.compacted':
    '上下文已压缩：{originalTokens} -> {compressedTokens} Token（{percentage}%）',
  'agent.terminal.diagnostic.sessionMode.unsupported': '不支持的会话模式：{mode}。有效值：{modes}',
  'agent.terminal.diagnostic.sessionMode.unavailable': '当前会话不支持切换会话模式。',
  'agent.terminal.diagnostic.executionMode.unavailable': '当前会话不支持切换执行模式。',
  'agent.terminal.diagnostic.context.compactionUnavailable': '当前会话不支持压缩上下文。',
  'agent.terminal.startup.model': '模型：{modelId}',
  'agent.terminal.startup.workDir': '工作目录：{path}',
  'agent.terminal.startup.mode': '模式：{executionMode}',
  'agent.terminal.startup.help': '输入 /help 查看命令，按 Ctrl+C 退出',
  'agent.terminal.message.systemError': '错误：{detail}',
  'agent.terminal.reference.loadingErrorOne': '引用错误：',
  'agent.terminal.reference.loadingErrorMany': '引用错误：',
  'agent.terminal.reference.loadingErrorRow': '- {reference}：{detail}',
  'agent.terminal.reference.suggestionFailed': '加载引用建议失败：{detail}',
  'agent.terminal.reference.readFailed': '读取 {path} 失败：{detail}',
  'agent.terminal.reference.parseFailed': '解析 {path} 失败：{detail}',
  'agent.terminal.reference.expectedObject': '{source} 必须包含 JSON 对象。',
  'agent.terminal.reference.expectedArray': '{source} 必须是数组。',
  'agent.terminal.reference.expectedEntryObject': '{source}[{index}] 必须是 JSON 对象。',
  'agent.terminal.reference.invalidEntry': '{source}[{index}] 无效。',
  'agent.terminal.reference.expectedStringField': '{source}.{field} 必须是字符串。',
  'agent.terminal.runtime.workspaceContentReadFailed': '读取 {path} 失败：{detail}',
  'agent.terminal.runtime.workspaceContentParseFailed': '解析 {path} 失败：{detail}',
  'agent.terminal.runtime.resumeNotFoundStartingFresh':
    '未找到对话“{conversationId}”；将开始新对话。',
  'agent.terminal.runtime.continuationDiscarded': '已丢弃续跑：{itemId}',
  'agent.terminal.runtime.skillInvocationRejected': 'Skill“{skillName}”不可用。',
  'agent.terminal.runtime.taskContinuationReady': '任务结果已就绪，将从已完成的异步结果继续执行。',
  'agent.terminal.runtime.taskContinuationReadyWithId':
    '任务结果 {taskId} 已就绪，将从已完成的异步结果继续执行。',
  'agent.terminal.runtime.subagentContinuationReady':
    '子 Agent 结果已就绪，将从已完成的子 Agent 结果继续执行。',
  'agent.terminal.runtime.subagentContinuationReadyWithId':
    '子 Agent 结果 {subagentId} 已就绪，将从已完成的子 Agent 结果继续执行。',
  'agent.terminal.runtime.systemContinuationReady': '系统续跑已就绪，将继续执行 Agent。',
  'agent.terminal.runtime.taskContinuationQueued':
    '任务续跑已入队：{itemId}（{pendingCount} 条待处理）',
  'agent.terminal.runtime.subagentContinuationQueued':
    '子 Agent 结果续跑已入队：{itemId}（{pendingCount} 条待处理）',
  'agent.terminal.runtime.systemContinuationQueued':
    '系统续跑已入队：{itemId}（{pendingCount} 条待处理）',
  'agent.terminal.runtime.workspaceStateSyncFailed': '同步工作区运行状态失败：{detail}',
  'agent.terminal.runtime.taskStatusRefreshFailed': '刷新任务状态失败：{detail}',
  'agent.terminal.runtime.taskResultReady': '任务结果已就绪。继续执行：{prompt}',
  'agent.terminal.runtime.mediaResultPersistenceFailed': '保存媒体任务结果 URL 失败。',
  'agent.terminal.runtime.mediaResultPersistenceFailedWithDetail':
    '保存媒体任务结果 URL 失败：{detail}',
  'agent.terminal.runtime.mediaProgressDeliveryFailed': '传递媒体任务进度失败：{taskId}',
  'agent.terminal.runtime.mediaProgressDeliveryFailedWithDetail':
    '传递媒体任务进度失败：{taskId}：{detail}',
  'agent.terminal.runtime.taskObservation.notTerminal':
    '任务 {taskId} 尚未结束，无法记录任务结果。',
  'agent.terminal.runtime.taskObservation.invalidOwnerScope': '任务 {taskId} 的所有者作用域无效。',
  'agent.terminal.runtime.taskObservation.ownerScopeMismatch':
    '任务 {taskId} 的结果属于另一个所有者作用域。',
  'agent.terminal.runtime.taskObservation.malformedResultRef':
    '任务 {taskId} 包含格式错误的结果引用。',
  'agent.terminal.runtime.taskObservation.unsafeResultRef': '任务 {taskId} 包含不安全的结果引用。',
  'agent.terminal.runtime.taskObservation.invalidDeliveryPolicy':
    '任务 {taskId} 的结果传递策略无效。',
  'agent.terminal.runtime.taskObservation.invalidTaskGroup': '任务 {taskId} 的结果传递组无效。',
  'agent.terminal.runtime.taskObservation.recordingFailed':
    '记录任务 {taskId} 的结果失败：{detail}',
  'agent.terminal.runtime.taskObservation.recordingFailedWithoutDetail':
    '记录任务 {taskId} 的结果失败。',
  'agent.terminal.runtime.taskObservation.followupFailed':
    '任务 {taskId} 完成后的续跑失败：{detail}',
  'agent.terminal.runtime.taskObservation.followupFailedWithoutDetail':
    '任务 {taskId} 完成后的续跑失败。',
  'agent.terminal.errorBoundary.crashed': '{label} 已崩溃',
  'agent.terminal.errorBoundary.recovery': '按 Ctrl+L 重置，或按 Ctrl+C 退出。',
  'agent.terminal.queue.unknownItem': '未知队列项：{itemId}',
  'agent.terminal.queue.continuationNotEditable': '无法编辑队列中的继续项：{itemId}',
  'agent.terminal.queue.draftConflict': '应用编辑前，队列消息已发生变化。',
  'agent.terminal.queue.status.empty': '队列为空（版本 {version}）',
  'agent.terminal.queue.status.header': '队列：{pendingCount} 条待处理（版本 {version}）',
  'agent.terminal.queue.status.row': '{index}. {itemId} [{source}] {content}',
  'agent.terminal.queue.enqueued': '消息已入队（{pendingCount} 条待处理）',
  'agent.terminal.queue.promotedUserMessage': '排队消息已安排为下一条可执行用户消息：{itemId}',
  'agent.terminal.queue.promotedContinuation': '排队续跑已在续跑优先级内提升：{itemId}',
  'agent.terminal.queue.cancelled': '排队消息已取消：{itemId}',
  'agent.terminal.queue.discarded': '排队续跑已丢弃：{itemId}',
  'agent.terminal.queue.edited': '排队消息已编辑：{itemId}',
  'agent.terminal.diagnostic.queue.unavailable': '当前会话不支持消息队列控制。',
  'agent.terminal.diagnostic.queue.usage':
    '用法：/queue list | /queue promote <id> | /queue send-next <id> | /queue cancel <id> | /queue discard <id> | /queue edit <id> <text>',
  'agent.terminal.diagnostic.queue.editUsage': '用法：/queue edit <id> <text>',
  'agent.terminal.diagnostic.queue.sendNowUnsupported':
    'send-now 命令不能中断当前轮次。请使用 /queue send-next <id> 或 /queue promote <id>。',
  'agent.terminal.diagnostic.queue.discardUnavailable': '当前会话不支持丢弃队列续跑。',
  'agent.terminal.diagnostic.queue.operationUnavailable': '当前会话不支持队列操作：{operation}',
  'agent.terminal.diagnostic.queue.unknownCommand':
    '未知队列命令：{command}。用法：/queue list | /queue promote <id> | /queue send-next <id> | /queue cancel <id> | /queue discard <id> | /queue edit <id> <text>',
  'agent.terminal.diagnostic.queue.operationFailed': '队列操作失败：{detail}',
  'agent.terminal.diagnostic.queue.operationFailedWithCode':
    '队列操作失败（{operationCode}）：{detail}',
  'agent.terminal.task.empty': '没有任务。',
  'agent.terminal.task.emptyFiltered': '没有{status}任务。',
  'agent.terminal.task.header': '任务：',
  'agent.terminal.task.headerFiltered': '任务（{status}）：',
  'agent.terminal.task.row': '  {id}  {status}  {progress}%  {runMode}  {title}',
  'agent.terminal.task.rowWithError':
    '  {id}  {status}  {progress}%  {runMode}  {title}  错误={error}',
  'agent.terminal.task.usage': '用法：/tasks [pending|running|completed|failed|cancelled|all]',
  'agent.terminal.diagnostic.task.unavailable': '当前会话无法查看任务状态。',
  'agent.terminal.diagnostic.task.usage':
    '用法：/tasks [pending|running|completed|failed|cancelled|all] 或 /tasks status [status]',
  'agent.terminal.mcp.servers.empty': '未配置 MCP 服务。',
  'agent.terminal.mcp.servers.header': 'MCP 服务：',
  'agent.terminal.mcp.servers.transport': '传输={transport}',
  'agent.terminal.mcp.servers.tools': '工具={count}',
  'agent.terminal.mcp.servers.row': '  {serverId}  {status}  {details}',
  'agent.terminal.mcp.usage':
    '用法：/mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
  'agent.terminal.mcp.tools.empty': '没有 MCP 工具。',
  'agent.terminal.mcp.tools.emptyScoped': '{serverId} 没有 MCP 工具。',
  'agent.terminal.mcp.tools.header': 'MCP 工具：',
  'agent.terminal.mcp.tools.headerScoped': '{serverId} 的 MCP 工具：',
  'agent.terminal.mcp.tools.row': '  {tool}',
  'agent.terminal.mcp.connected': 'MCP 服务已连接：{serverId}',
  'agent.terminal.mcp.disconnected': 'MCP 服务已断开：{serverId}',
  'agent.terminal.mcp.reconnected': 'MCP 服务已重新连接：{serverId}',
  'agent.terminal.value.mcpStatus.disabled': '已禁用',
  'agent.terminal.value.mcpStatus.connected': '已连接',
  'agent.terminal.value.mcpStatus.disconnected': '未连接',
  'agent.terminal.value.unknown': '未知',
  'agent.terminal.diagnostic.mcp.unavailable': '当前会话不支持 MCP 控制。',
  'agent.terminal.diagnostic.mcp.tools-unavailable': '当前会话无法列出 MCP 工具。',
  'agent.terminal.diagnostic.mcp.usage':
    '用法：/mcp status | /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
  'agent.terminal.diagnostic.mcp.unknown-server': '未知 MCP 服务：{serverId}',
  'agent.terminal.diagnostic.mcp.server-disabled': 'MCP 服务已禁用：{serverId}',
  'agent.terminal.diagnostic.mcp.connect-unavailable': '当前会话无法连接 MCP 服务。',
  'agent.terminal.diagnostic.mcp.disconnect-unavailable': '当前会话无法断开 MCP 服务。',
  'agent.terminal.diagnostic.mcp.reconnect-unavailable': '当前会话无法重新连接 MCP 服务。',
  'agent.terminal.diagnostic.mcp.unknown-command':
    '未知 MCP 命令：{command}。用法：/mcp status | /mcp tools [serverId] | /mcp connect <serverId> | /mcp disconnect <serverId> | /mcp reconnect <serverId>',
  'agent.terminal.diagnostic.mcp.operation-failed': 'MCP 操作失败：{detail}',
  'agent.terminal.capability.providers.empty': '未注册 TUI 能力提供者。',
  'agent.terminal.capability.providers.header': 'TUI 能力提供者：',
  'agent.terminal.capability.providers.row':
    '  {providerId}  {state}  已加载={loadedCount} 已跳过={skippedCount}',
  'agent.terminal.capability.usage':
    '用法：/capability show <providerId> | /capability tools [providerId]',
  'agent.terminal.capability.provider.header': '能力提供者：{providerId}',
  'agent.terminal.capability.provider.version': '版本：{version}',
  'agent.terminal.capability.provider.loaded': '已加载：',
  'agent.terminal.capability.provider.loadedRow': '  {kind}  {name}',
  'agent.terminal.capability.provider.skipped': '已跳过：',
  'agent.terminal.capability.tools.empty': '没有能力工具。',
  'agent.terminal.capability.tools.emptyScoped': '{providerId} 没有能力工具。',
  'agent.terminal.capability.tools.header': '能力工具：',
  'agent.terminal.capability.tools.headerScoped': '{providerId} 的能力工具：',
  'agent.terminal.capability.tools.row': '  {tool}',
  'agent.terminal.capability.diagnostics.empty': '没有能力诊断。',
  'agent.terminal.capability.diagnostics.header': '能力诊断：',
  'agent.terminal.capability.diagnostics.row': '  {level} {providerId} {kind}：{reason}',
  'agent.terminal.capability.diagnostics.rowWithName':
    '  {level} {providerId} {kind} {name}：{reason}',
  'agent.terminal.capability.diagnostics.rowWithRequirement':
    '  {level} {providerId} {kind}：{reason} 要求={requirement}',
  'agent.terminal.capability.diagnostics.rowWithNameAndRequirement':
    '  {level} {providerId} {kind} {name}：{reason} 要求={requirement}',
  'agent.terminal.value.capabilityState.loaded': '已加载',
  'agent.terminal.value.capabilityState.skipped': '已跳过',
  'agent.terminal.value.capabilityState.empty': '空',
  'agent.terminal.value.noneIndented': '  （无）',
  'agent.terminal.diagnostic.capability.unavailable': '当前会话无法查看能力诊断。',
  'agent.terminal.diagnostic.capability.show-usage': '用法：/capability show <providerId>',
  'agent.terminal.diagnostic.capability.unknown-provider': '未知能力提供者：{providerId}',
  'agent.terminal.diagnostic.capability.unknown-command':
    '未知能力命令：{command}。用法：/capability list | /capability show <providerId> | /capability tools [providerId]',
  'agent.terminal.artifact.list.empty': '没有工件引用。',
  'agent.terminal.artifact.list.row': '{id}  {kind}',
  'agent.terminal.artifact.list.rowWithDetails': '{id}  {kind}  {details}',
  'agent.terminal.artifact.kind.image': '图像引用',
  'agent.terminal.artifact.kind.video': '视频引用',
  'agent.terminal.artifact.kind.audio': '音频引用',
  'agent.terminal.artifact.kind.document': '文档引用',
  'agent.terminal.artifact.kind.artifact': '工件引用',
  'agent.terminal.artifact.kind.unknown': '未知引用',
  'agent.terminal.artifact.field.ref': '- 引用：{value}',
  'agent.terminal.artifact.field.asset': '- 资源：{value}',
  'agent.terminal.artifact.field.artifact': '- 工件：{value}',
  'agent.terminal.artifact.field.task': '- 任务：{value}',
  'agent.terminal.artifact.field.tool': '- 工具：{value}',
  'agent.terminal.artifact.field.file': '- 文件：{value}',
  'agent.terminal.artifact.field.size': '- 尺寸：{value}',
  'agent.terminal.artifact.field.duration': '- 时长：{value}',
  'agent.terminal.artifact.field.probe': '- 探测：{value}',
  'agent.terminal.artifact.externalDiagnostic': '! {detail}',
  'agent.terminal.artifact.commands.header': '命令：',
  'agent.terminal.artifact.commands.row': '  {command}',
  'agent.terminal.artifact.opened': '已请求打开工件：{artifactId}',
  'agent.terminal.artifact.sent': '已将工件 {artifactId} 发送到 {target}',
  'agent.terminal.diagnostic.artifact.unavailable': '当前会话不支持工件控制。',
  'agent.terminal.diagnostic.artifact.list-unavailable': '当前会话无法列出工件。',
  'agent.terminal.diagnostic.artifact.show-usage': '用法：/artifact show <id>',
  'agent.terminal.diagnostic.artifact.show-unavailable': '当前会话无法查看工件详情。',
  'agent.terminal.diagnostic.artifact.unknown-reference': '未知工件引用：{artifactId}',
  'agent.terminal.diagnostic.artifact.open-usage': '用法：/artifact open <id>',
  'agent.terminal.diagnostic.artifact.open-unavailable': '当前会话无法打开工件。',
  'agent.terminal.diagnostic.artifact.send-usage': '用法：/artifact send <target> <id>',
  'agent.terminal.diagnostic.artifact.send-unavailable': '当前会话无法发送工件。',
  'agent.terminal.diagnostic.artifact.unknown-command':
    '未知工件命令：{command}。用法：/artifact list | /artifact show <id> | /artifact open <id> | /artifact send <target> <id>',
  'agent.terminal.model.status.header': '模型选择：',
  'agent.terminal.model.status.current': '当前对话模型：{modelId}',
  'agent.terminal.model.status.available': '可用对话模型：',
  'agent.terminal.model.status.option': '  {modelId}  {label}',
  'agent.terminal.model.status.optionCurrent': '* {modelId}  {label}',
  'agent.terminal.model.selected': '对话模型已切换为：{modelId}',
  'agent.terminal.model.menu.title': '对话模型',
  'agent.terminal.model.status.usage.chat':
    '用法：/model chat <provider:model|provider/model|model-id>',
  'agent.terminal.model.status.usage.media':
    '      /model <image|video|audio> <provider:model|provider/model|model-id|none>',
  'agent.terminal.model.status.usage.perception':
    '      /model perception <image|video|audio> <provider:model|provider/model|model-id|auto>',
  'agent.terminal.media.status.header': '媒体模型选择：',
  'agent.terminal.media.status.category': '{category}：{modelId} [{source}]',
  'agent.terminal.media.status.available': '可用{category}模型：',
  'agent.terminal.media.status.usage.all':
    '用法：/media <image|video|audio> <provider:model|provider/model|model-id|none> | /media reset',
  'agent.terminal.media.status.usage.category':
    '用法：/media <image|video|audio> <provider:model|provider/model|model-id|none>',
  'agent.terminal.media.selected': '{category}模型已设为：{modelId}',
  'agent.terminal.media.disabled': '本会话已禁用{category}生成。',
  'agent.terminal.media.reset': '媒体模型覆盖已重置为配置默认值。',
  'agent.terminal.media.menu.title': '{category}模型',
  'agent.terminal.media.menu.none.label': '无',
  'agent.terminal.media.menu.none.description': '在本会话中禁用{category}生成',
  'agent.terminal.perception.status.header': '感知模型：',
  'agent.terminal.perception.status.category': '{category}：{modelId}',
  'agent.terminal.perception.status.available': '可用{category}感知模型：',
  'agent.terminal.perception.status.usage.all':
    '用法：/perception <image|video|audio> <provider:model|provider/model|model-id|auto> | /perception reset',
  'agent.terminal.perception.status.usage.category':
    '用法：/perception <image|video|audio> <provider:model|provider/model|model-id|auto>',
  'agent.terminal.perception.selected': '{category}感知模型已设为：{modelId}',
  'agent.terminal.perception.automatic': '{category}感知模型已设为自动选择。',
  'agent.terminal.perception.reset': '感知模型覆盖已重置为自动选择。',
  'agent.terminal.perception.menu.title': '{category}感知模型',
  'agent.terminal.perception.menu.auto.label': '自动',
  'agent.terminal.perception.menu.auto.description': '自动选择{category}感知模型',
  'agent.terminal.diagnostic.model.unknown':
    '未知的对话模型标识：{modelId}。使用 /model chat 查看可用对话模型。',
  'agent.terminal.diagnostic.model.unavailable': '当前会话不支持选择对话模型。',
  'agent.terminal.diagnostic.model.operationFailed': '选择对话模型失败。',
  'agent.terminal.diagnostic.media.unknown':
    '未知的{category}媒体模型标识：{modelId}。使用 /media {category} 查看可用模型。',
  'agent.terminal.diagnostic.media.unavailable': '当前会话不支持选择媒体模型。',
  'agent.terminal.diagnostic.media.categoryUnknown':
    '未知的媒体类别。有效值：image、video、audio、reset。',
  'agent.terminal.diagnostic.media.resetUnavailable': '当前会话不支持重置媒体模型。',
  'agent.terminal.diagnostic.media.resetFailed': '重置媒体模型失败。',
  'agent.terminal.diagnostic.media.operationFailed': '更新{category}媒体模型失败。',
  'agent.terminal.diagnostic.perception.unknown':
    '未知的{category}感知模型标识：{modelId}。使用 /perception {category} 查看可用模型。',
  'agent.terminal.diagnostic.perception.unavailable': '当前会话不支持选择感知模型。',
  'agent.terminal.diagnostic.perception.categoryUnknown':
    '未知的感知类别。有效值：image、video、audio、reset。',
  'agent.terminal.diagnostic.perception.resetUnavailable': '当前会话不支持重置感知模型。',
  'agent.terminal.diagnostic.perception.resetFailed': '重置感知模型失败。',
  'agent.terminal.diagnostic.perception.operationFailed': '更新{category}感知模型失败。',
  'agent.terminal.value.mediaCategoryTitle.image': '图像',
  'agent.terminal.value.mediaCategoryTitle.video': '视频',
  'agent.terminal.value.mediaCategoryTitle.audio': '音频',
  'agent.terminal.value.model.none': '（无）',
  'agent.terminal.value.model.auto': '自动',
  'agent.terminal.value.modelSource.sessionOverride': '会话覆盖',
  'agent.terminal.value.modelSource.configDefault': '配置默认值',
  'agent.terminal.value.modelSource.notSet': '未设置',
  'agent.terminal.status.model': '模型：{modelId}',
  'agent.terminal.status.session': '会话类型：{sessionMode}',
  'agent.terminal.status.mode': '执行模式：{executionMode}',
  'agent.terminal.status.state': '状态：{status}',
  'agent.terminal.status.mediaModel': '媒体模型（{category}）：{modelId}',
  'agent.terminal.status.perceptionModel': '感知模型（{category}）：{modelId}',
  'agent.terminal.status.parameter': '参数（{name}）：{value}',
  'agent.terminal.status.tokens': 'Token：{count}',
  'agent.terminal.status.contextTokens': '上下文 Token：{count}',
  'agent.terminal.status.skills.none': '技能：无',
  'agent.terminal.status.skills.one': '技能：{count} 个已激活',
  'agent.terminal.status.skills.many': '技能：{count} 个已激活',
  'agent.terminal.status.queue': '队列：{count}',
  'agent.terminal.status.task': '任务：{taskId}（{status}）',
  'agent.terminal.status.config': '用户配置：{path}',
  'agent.terminal.value.taskStatus.pending': '等待中',
  'agent.terminal.value.taskStatus.running': '运行中',
  'agent.terminal.value.taskStatus.completed': '已完成',
  'agent.terminal.value.taskStatus.failed': '失败',
  'agent.terminal.value.taskStatus.cancelled': '已取消',
  'agent.terminal.value.agentStatus.idle': '空闲',
  'agent.terminal.value.agentStatus.running': '运行中',
  'agent.terminal.value.agentStatus.waitingConfirmation': '等待确认',
  'agent.terminal.value.agentStatus.error': '错误',
  'agent.terminal.value.executionMode.plan': '规划',
  'agent.terminal.value.executionMode.ask': '询问',
  'agent.terminal.value.executionMode.auto': '自动',
  'agent.terminal.value.sessionMode.agent': '智能体',
  'agent.terminal.value.sessionMode.image': '图像',
  'agent.terminal.value.sessionMode.video': '视频',
  'agent.terminal.value.sessionMode.audio': '音频',
  'agent.terminal.chrome.model': '模型',
  'agent.terminal.chrome.workDir': '工作目录',
  'agent.terminal.chrome.mode': '模式',
  'agent.terminal.chrome.chat': '对话',
  'agent.terminal.chrome.media': '媒体',
  'agent.terminal.chrome.perception': '感知',
  'agent.terminal.chrome.none': '无',
  'agent.terminal.chrome.skill': '技能',
  'agent.terminal.chrome.skills': '技能',
  'agent.terminal.chrome.queue': '队列',
  'agent.terminal.chrome.task': '任务',
  'agent.terminal.chrome.locked': '锁定',
  'agent.terminal.chrome.more': '更多',
  'agent.terminal.chrome.multiLineHint': '[多行: Shift+Enter 换行]',
  'agent.terminal.chrome.selectionHint': '↑↓:导航 Enter:选择 Esc:取消',
  'agent.terminal.chrome.noMatchingCommands': '无匹配命令',
  'agent.terminal.chrome.startupHelp': '输入 /help 查看命令，输入 /exit 退出',
  'agent.terminal.stageGuardian.stageOutOfOrder':
    '[{code}] 未先进入 Draft / Plan 就进入了 Apply；高风险工具调用应按 ADR §3.2 先经过前置阶段。',
  'agent.terminal.stageGuardian.stageTimeout':
    '[{code}] 阶段“{stage}”已持续 {elapsedMs} 毫秒，超过 {budgetMs} 毫秒预算。',
  'agent.terminal.stageGuardian.approvalSkipped':
    '[{code}] 主题“{subject}”的 Apply 未经先前审批决策即已提交。',
  'agent.terminal.activity.processing': '处理中',
  'agent.terminal.activity.processingWithIteration': '处理中（{current}/{max}）',
  'agent.terminal.activity.processingWithElapsed': '处理中 {duration}',
  'agent.terminal.activity.processingWithIterationAndElapsed':
    '处理中（{current}/{max}）{duration}',
  'agent.terminal.activity.thinking': '思考中…',
  'agent.terminal.activity.thinkingWithElapsed': '思考中…（已思考 {duration}）',
  'agent.terminal.activity.generating': '生成中',
  'agent.terminal.activity.generatingWithElapsed': '生成中 {duration}',
  'agent.terminal.activity.thinkingBlock.active': '思考中...',
  'agent.terminal.activity.thinkingBlock.thoughtOne': '* 已思考 {count} 行',
  'agent.terminal.activity.thinkingBlock.thoughtMany': '* 已思考 {count} 行',
  'agent.terminal.activity.thinkingBlock.moreOne': '... 另有 {count} 行',
  'agent.terminal.activity.thinkingBlock.moreMany': '... 另有 {count} 行',
  'agent.terminal.timeline.fallback.tool': '工具',
  'agent.terminal.timeline.fallback.task': '任务',
  'agent.terminal.timeline.fallback.media': '媒体任务',
  'agent.terminal.timeline.fallback.error': '时间线错误',
  'agent.terminal.timeline.result.failed': '失败',
  'agent.terminal.timeline.result.attachments': '附件={count}',
  'agent.terminal.timeline.result.perceptionCards': '感知卡片={count}',
  'agent.terminal.timeline.result.artifacts': '产物={count}',
  'agent.terminal.timeline.backfill.keys': '已更新 {keys}',
  'agent.terminal.timeline.backfill.empty': '已更新结果',
  'agent.terminal.timeline.compositeReference': '复合内容可通过终端引用访问。',
  'agent.terminal.timeline.diagnostic.missingToolCall': 'tool_call 事件缺少 toolCall 载荷。',
  'agent.terminal.timeline.diagnostic.missingToolAnchor': '{event} 事件缺少工具锚点。',
  'agent.terminal.timeline.diagnostic.unknownToolAnchor': '{event} 事件引用了未知工具。',
  'agent.terminal.timeline.diagnostic.itemKindMismatch': '时间线项目类型意外改变。',
  'agent.terminal.timeline.diagnostic.appendNonTextItem': '时间线追加操作要求文本项目。',
  'agent.terminal.timeline.diagnostic.sourceGenerationMismatch': '时间线追加操作的来源代次不匹配。',
  'agent.terminal.timeline.diagnostic.completeMissingItem': '时间线完成操作引用了未知文本项目。',
  'agent.terminal.timeline.diagnostic.completeIdentityMismatch': '时间线完成操作的身份不匹配。',
  'agent.terminal.timeline.diagnostic.duplicateItemRevision': '该时间线项目修订已应用。',
  'agent.terminal.timeline.diagnostic.staleItemRevision': '该时间线项目修订已过期。',
  'agent.terminal.timeline.diagnostic.unknownParentItem': '时间线项目引用了未知父项目。',
  'agent.terminal.approval.required': '需要批准工具调用',
  'agent.terminal.approval.yes': '同意',
  'agent.terminal.approval.no': '拒绝',
  'agent.terminal.approval.always': '始终允许',
  'agent.terminal.approval.moreLines.one': '... 另有 {count} 行',
  'agent.terminal.approval.moreLines.many': '... 另有 {count} 行',
  'agent.terminal.approval.cwd': '工作目录：{cwd}',
  'agent.terminal.queue.nextTurn': '下一轮',
  'agent.terminal.queue.userMessage': '消息',
  'agent.terminal.queue.taskContinuation': '任务续跑',
  'agent.terminal.queue.subagentContinuation': '子代理续跑',
  'agent.terminal.queue.systemContinuation': '系统续跑',
  'agent.terminal.queue.continuationPriority': '内部续跑优先',
  'agent.terminal.queue.moreItems': '条',
  'agent.terminal.queue.commandHint': '使用 /queue list 查看或管理排队消息',
  'agent.terminal.queue.sendNext': '下一条执行',
  'agent.terminal.queue.nextUserMessage': '下一条用户消息',
  'agent.terminal.queue.edit': '编辑',
  'agent.terminal.queue.cancel': '取消',
  'agent.terminal.queue.pausedAfterCancel': '当前任务取消后队列已暂停',
  'agent.terminal.queue.keyboardActions': '队列快捷键',
  'agent.terminal.value.mediaCategory.image': '图像',
  'agent.terminal.value.mediaCategory.video': '视频',
  'agent.terminal.value.mediaCategory.audio': '音频',
  'agent.terminal.value.mediaCategory.sequence': '序列',
  'agent.terminal.value.mediaCategory.text': '文本',
  'agent.terminal.value.mediaCategory.document': '文档',
  'agent.terminal.value.referenceSource.workspaceFile': '工作区文件',
  'agent.terminal.value.referenceSource.generatedAssets': '生成素材',
  'agent.terminal.value.referenceSource.mediaLibrary': '媒体库',
  'agent.terminal.value.referenceSource.entityGraph': '实体图谱',
  'agent.terminal.value.referenceSource.story': '故事',
  'agent.terminal.value.referenceSource.canvas': '画布',
  'agent.terminal.value.suggestionKind.command': '命令',
  'agent.terminal.value.suggestionKind.skill': '技能',
  'agent.terminal.value.suggestionKind.file': '文件',
  'agent.terminal.value.suggestionKind.asset': '素材',
  'agent.terminal.value.suggestionKind.media': '媒体',
  'agent.terminal.value.suggestionKind.entity': '实体',
  'agent.terminal.value.suggestionKind.canvasNode': '画布节点',
  'agent.terminal.value.suggestionKind.character': '角色',
  'agent.terminal.value.suggestionKind.scene': '场景',
  'agent.terminal.config.status.header': '当前配置：',
  'agent.terminal.config.status.field.provider': '提供者',
  'agent.terminal.config.status.field.model': '模型',
  'agent.terminal.config.status.field.apiKey': 'API 密钥',
  'agent.terminal.config.status.field.baseUrl': '基础 URL',
  'agent.terminal.config.status.field.maxOutputTokens': '最大输出 Token 数',
  'agent.terminal.config.status.field.temperature': '温度',
  'agent.terminal.config.status.field.verbose': '详细输出',
  'agent.terminal.config.status.field.outputFormat': '输出格式',
  'agent.terminal.config.status.field.workDir': '工作目录',
  'agent.terminal.config.status.field.mcpServers': 'MCP 服务器',
  'agent.terminal.config.status.row': '  {name}：{value}',
  'agent.terminal.config.status.usage.set': '使用“/config set <key> <value>”修改设置。',
  'agent.terminal.config.status.usage.providers': '使用“/config providers”列出可用提供者。',
  'agent.terminal.config.status.usage.models': '使用“/config models”列出可用模型。',
  'agent.terminal.config.updated': '已设置 {key} = {value}',
  'agent.terminal.config.providers.header': '可用提供者：',
  'agent.terminal.config.providers.row': '  {providerId}（{displayName}）',
  'agent.terminal.config.providers.type': '    类型：{type}',
  'agent.terminal.config.providers.apiKey': '    API 密钥：{state}',
  'agent.terminal.config.providers.models': '    模型：{models}',
  'agent.terminal.config.models.header': '{providerId} 的可用模型：',
  'agent.terminal.config.models.row': '    {modelId}',
  'agent.terminal.config.models.rowCurrent': '  * {modelId}',
  'agent.terminal.config.models.currentHint': '（* = 当前模型）',
  'agent.terminal.value.notSet': '（未设置）',
  'agent.terminal.value.none': '（无）',
  'agent.terminal.resume.resumedOne': '已恢复：“{title}”（{messageCount} 条消息，{updatedAt}）',
  'agent.terminal.resume.resumedMany': '已恢复：“{title}”（{messageCount} 条消息，{updatedAt}）',
  'agent.terminal.resume.empty': '此工作区没有已保存的对话。',
  'agent.terminal.resume.header': '已保存的对话：',
  'agent.terminal.resume.row': '  [{index}] {title}',
  'agent.terminal.resume.rowCurrent': '  [{index}] {title}（当前）',
  'agent.terminal.resume.summaryOne':
    '      id：{conversationId} · {updatedAt} · {messageCount} 条消息',
  'agent.terminal.resume.summaryMany':
    '      id：{conversationId} · {updatedAt} · {messageCount} 条消息',
  'agent.terminal.resume.usage': '使用“/resume <id>”恢复对话。',
  'agent.terminal.history.empty': '当前会话中没有消息。',
  'agent.terminal.history.headerOne': '对话历史（{messageCount} 条消息）：',
  'agent.terminal.history.headerMany': '对话历史（{messageCount} 条消息）：',
  'agent.terminal.history.row': '  [{index}] {role}：{preview}',
  'agent.terminal.history.role.user': '你',
  'agent.terminal.history.role.assistant': '助手',
  'agent.terminal.history.role.tool': '工具',
  'agent.terminal.history.structured': '[工具/结构化内容]',
  'agent.terminal.diagnostic.config.setUsage': '用法：/config set <key> <value>',
  'agent.terminal.diagnostic.config.invalidKey':
    '无效配置键：{key}。有效键：provider、model、maxTokens、temperature、verbose、outputFormat',
  'agent.terminal.diagnostic.config.invalidMaxTokens': 'maxTokens 必须是数字',
  'agent.terminal.diagnostic.config.invalidTemperature': 'temperature 必须是 0 到 2 之间的数字',
  'agent.terminal.diagnostic.config.invalidOutputFormat':
    'outputFormat 必须是 text、json 或 markdown',
  'agent.terminal.diagnostic.config.updateUnavailable': '当前会话不支持配置更新。',
  'agent.terminal.diagnostic.config.modelsEmpty': '提供者 {providerId} 未配置模型',
  'agent.terminal.diagnostic.config.unknownCommand':
    '未知 config 子命令：{command}。使用 /config、/config set、/config providers 或 /config models',
  'agent.terminal.diagnostic.resume.unavailable': '对话存储不可用。',
  'agent.terminal.diagnostic.resume.notFound': '未找到对话“{conversationId}”。',
  'agent.terminal.diagnostic.resume.storageFailed': '读取对话存储失败：{detail}',
  'agent.terminal.diagnostic.history.unavailable': '历史记录不可用。',
  'agent.terminal.value.done': '完成',
  'agent.terminal.markdown.fatalTitle': 'Markdown 渲染失败',
  'agent.terminal.markdown.syntheticColumn': '第 {index} 列',
  'agent.terminal.markdown.unresolved': '未解析：{label}',
  'agent.terminal.markdown.image': '图像：{alt}',
  'agent.terminal.markdown.linkTarget': '目标：{target}',
  'agent.terminal.markdown.unsafeControl': '不安全的终端控制字符 {control}',
  'agent.terminal.markdown.unsupportedDestination': '不支持的目标：{target}',
  'agent.terminal.markdown.tableGridBudgetExceeded':
    '表格网格预算已超出（{cells} 个单元格），已改用记录布局',
  'agent.terminal.markdown.highlightLimitExceeded': '语法高亮超出限制，已完整显示为纯代码',
} as const satisfies Readonly<Record<CliTerminalMessageKey, string>>;

export const CLI_TERMINAL_MESSAGE_SOURCE = {
  owner: 'neko-tui',
  bundles: {
    en: CLI_TERMINAL_MESSAGES_EN,
    'zh-cn': CLI_TERMINAL_MESSAGES_ZH_CN,
  },
} as const satisfies StrictMessageBundleSource;
