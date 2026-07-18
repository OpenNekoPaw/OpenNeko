export * from './types/index';

// Shared utilities (animation, easing, interpolation)
export * from './utils/index';

// Configuration (unified config format for agent-cli and platform)
export * from './config/index';

// Error handling (BaseError + IErrorHandler)
export * from './errors/index';

// Tools
export * from './tools/index';

// Core utilities
export * from './core/index';

// Operations (EditOperation 指令序列系统)
export * from './operations';

// Logger (ILogger + ConsoleLogger)
export * from './logger/index';

// i18n (II18nService + I18nService)
export * from './i18n/index';

// Theme (design tokens + ThemeKind)
export * from './theme/index';

// Path resolution (PathResolver + variable expansion)
export * from './path/index';

// Host-neutral local metadata store and repository contracts
export * from './local-metadata/index';

// Project file I/O contracts and host-agnostic helpers
export * from './project-file-io/index';

// Client-neutral package authoring contracts
export * from './project-authoring/index';

// Entity URI (entity:// protocol parsing + building)
export * from './entity-uri/index';

// Format SDKs (load/validate/migrate/save project files)
export * from './nkv/index';
export * from './nkc/index';

// VSCode Webview API is NOT exported from main entry to avoid
// requiring DOM types in Node.js consumers.
// Use subpath import instead: import { ... } from '@neko/shared/vscode';
//
// VSCode Extension Host API (OutputChannelTransport, VSCodeErrorHandler, etc.)
// Use subpath import: import { ... } from '@neko/shared/vscode/extension';
