/**
 * Input Module
 *
 * Provides input processing utilities for parsing user input
 * with file references (@ mentions).
 */

export { InputProcessor, createInputProcessor } from './input-processor';

export { NodeFileReader, createNodeFileReader } from './node-file-reader';

export {
  DEFAULT_MENTION_EXCLUDED_DIRECTORIES,
  DEFAULT_MENTION_EXCLUDE_GLOB,
  isMentionExcludedPath,
} from './mention-excludes';

export {
  createWorkspaceFileIgnoreRules,
  matchesGitignoreRules,
  normalizeRelativePath,
  parseGitignoreRules,
  shouldIgnoreWorkspaceFile,
  type WorkspaceFileIgnoreDecision,
  type WorkspaceFileIgnoreReason,
  type WorkspaceFileIgnoreRules,
} from './workspace-ignore';

export {
  VSCodeFileReader,
  createVSCodeFileReader,
  type VSCodeWorkspaceAPI,
} from './vscode-file-reader';

export type {
  FileReference,
  ProcessedInput,
  InputProcessorOptions,
  IFileReader,
  IInputProcessor,
} from './types';
