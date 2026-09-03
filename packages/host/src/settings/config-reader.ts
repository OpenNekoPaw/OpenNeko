/**
 * Configuration Reader
 *
 * Reads TOML configuration files from user and workspace locations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse, stringify, TomlError } from 'smol-toml';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import {
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  projectTomlConfig,
  unifiedConfigToToml,
  type ProviderCredentialDeclaration,
  type TomlConfigValidationIssue,
  type UnifiedConfig,
} from './config-core/index';

const logger = new ConsoleLogger('ConfigReader', LogLevel.Debug);

export type ConfigReadErrorCode =
  | 'empty'
  | 'invalidToml'
  | 'invalidConfigField'
  | 'unsupportedProviderType'
  | 'unsupportedProviderConnectionKind'
  | 'unsupportedProviderSupportLevel'
  | 'unsupportedProviderModelFamily'
  | 'unsupportedProtocolAuthType'
  | 'unsupportedProtocolStreamFormat'
  | 'duplicateProviderId'
  | 'duplicateModelId'
  | 'invalidDefaultMaxTokens'
  | 'invalidModelTokenMetadata'
  | 'invalidProviderApiKey'
  | 'unsupportedModelType'
  | 'unsupportedDefaultModelType'
  | 'readError';

export type ConfigReadBlockingErrorCode = 'empty' | 'invalidToml' | 'readError';

export interface ConfigReadDiagnostic {
  readonly code: ConfigReadErrorCode;
  readonly filePath: string;
  readonly message: string;
  readonly path?: string;
  readonly detail?: string;
}

export type ConfigDocumentReadResult =
  | {
      readonly status: 'ok';
      readonly filePath: string;
      readonly document: unknown;
    }
  | {
      readonly status: 'missing';
      readonly filePath: string;
    }
  | {
      readonly status: ConfigReadBlockingErrorCode;
      readonly filePath: string;
      readonly diagnostic: ConfigReadDiagnostic;
    };

export type ConfigReadResult =
  | {
      readonly status: 'ok';
      readonly filePath: string;
      readonly config: UnifiedConfig;
      readonly diagnostics: readonly ConfigReadDiagnostic[];
      readonly providerCredentials: Readonly<Record<string, ProviderCredentialDeclaration>>;
    }
  | {
      readonly status: 'missing';
      readonly filePath: string;
    }
  | {
      readonly status: ConfigReadBlockingErrorCode;
      readonly filePath: string;
      readonly diagnostic: ConfigReadDiagnostic;
    };

export function isConfigReadError(
  result: ConfigReadResult,
): result is Extract<ConfigReadResult, { readonly status: ConfigReadErrorCode }> {
  return result.status !== 'ok' && result.status !== 'missing';
}

export function getConfigReadDiagnostic(
  result: ConfigReadResult,
): ConfigReadDiagnostic | undefined {
  return isConfigReadError(result) ? result.diagnostic : undefined;
}

// =============================================================================
// Path Utilities
// =============================================================================

/**
 * Get user config directory (~/.neko)
 */
export function getUserConfigDir(): string {
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

/**
 * Get canonical user config file path (~/.neko/config.toml)
 */
export function getUserConfigPath(): string {
  return path.join(getUserConfigDir(), CONFIG_FILE_NAME);
}

// =============================================================================
// Configuration Reading
// =============================================================================

/**
 * Read canonical TOML configuration from a file path with a typed result.
 *
 * @param filePath - Path to the TOML configuration file
 * @returns Typed read result that distinguishes missing, empty, invalid TOML, validation, and IO failures
 */
export function readConfigDocumentFileResult(filePath: string): ConfigDocumentReadResult {
  try {
    if (!fs.existsSync(filePath)) {
      return { status: 'missing', filePath };
    }

    const content = fs.readFileSync(filePath, 'utf-8').trim();
    if (!content) {
      return {
        status: 'empty',
        filePath,
        diagnostic: buildConfigReadDiagnostic('empty', filePath),
      };
    }
    return {
      status: 'ok',
      filePath,
      document: parse(content),
    };
  } catch (error) {
    const code = getConfigReadErrorCode(error);
    const diagnostic = buildConfigReadDiagnostic(code, filePath);
    logger.error(diagnostic.message);
    return { status: code, filePath, diagnostic };
  }
}

export function readConfigFileResult(filePath: string): ConfigReadResult {
  const result = readConfigDocumentFileResult(filePath);
  if (result.status !== 'ok') return result;
  const projection = projectTomlConfig(result.document);
  return {
    status: 'ok',
    filePath,
    config: projection.config,
    diagnostics: projection.diagnostics.map((issue) => projectLocalDiagnostic(issue, filePath)),
    providerCredentials: projection.providerCredentials,
  };
}

/**
 * Read user configuration with a typed result (~/.neko/config.toml)
 */
export function readUserConfigDocumentResult(): ConfigDocumentReadResult {
  return readConfigDocumentFileResult(getUserConfigPath());
}

export function readUserConfigResult(): ConfigReadResult {
  return readConfigFileResult(getUserConfigPath());
}

// =============================================================================
// Configuration Writing
// =============================================================================

export function writeConfigFile(
  filePath: string,
  config: UnifiedConfig,
  providerCredentials: Readonly<Record<string, ProviderCredentialDeclaration>> = {},
): void {
  const dir = path.dirname(filePath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    filePath,
    `${stringify(unifiedConfigToToml(config, providerCredentials))}`,
    'utf-8',
  );
}

/**
 * Write user configuration (~/.neko/config.toml)
 *
 * @param config - Configuration to write
 */
export function writeUserConfig(
  config: UnifiedConfig,
  providerCredentials: Readonly<Record<string, ProviderCredentialDeclaration>> = {},
): void {
  writeConfigFile(getUserConfigPath(), config, providerCredentials);
}

function getConfigReadErrorCode(error: unknown): ConfigReadBlockingErrorCode {
  return error instanceof TomlError ? 'invalidToml' : 'readError';
}

function projectLocalDiagnostic(
  issue: TomlConfigValidationIssue,
  filePath: string,
): ConfigReadDiagnostic {
  return {
    code: issue.code,
    filePath,
    path: issue.path,
    message: `Invalid configuration field ${issue.path}: ${filePath}`,
    detail: issue.message,
  };
}

function buildConfigReadDiagnostic(
  code: ConfigReadBlockingErrorCode,
  filePath: string,
): ConfigReadDiagnostic {
  switch (code) {
    case 'empty':
      return {
        code,
        filePath,
        message: `Configuration file is empty: ${filePath}`,
      };
    case 'invalidToml':
      return {
        code,
        filePath,
        message: `Configuration file contains invalid TOML: ${filePath}`,
      };
    case 'readError':
      return {
        code,
        filePath,
        message: `Failed to read configuration file: ${filePath}`,
      };
  }
}
