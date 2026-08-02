/**
 * Workspace module — `.neko/` directory resolver + JSONL sinks.
 *
 * See: docs/architecture/agent-unified-workflow.md §7 (product format
 * dichotomy) + §7.4 (canonical layout).
 */

export {
  createNekoPaths,
  NEKO_DIR,
  NEKO_SUBDIRS,
  NEKO_LOG_SUBDIRS,
  NEKO_LOG_FILES,
  NEKO_CACHE_FILES,
  NEKO_STATE_FILES,
  NEKO_MD_PREFIXES,
  type INekoPaths,
  type NekoSubdir,
  type NekoLogFile,
  type NekoCacheFile,
  type NekoStateFile,
} from './neko-paths';

export {
  NEKO_AGENTS_FILE_NAME,
  NEKO_CONTENT_DIR,
  NEKO_CONTENT_SUBDIRS,
  resolveAgentsFile,
  resolveNekoContentDir,
  resolvePersonalAgentsFile,
  resolvePersonalNekoContentDir,
  resolveProjectAgentsFile,
  resolveProjectNekoContentDir,
  type NekoContentSource,
  type NekoContentSubdir,
} from './neko-content-layout';

export {
  createSessionLock,
  type ISessionLock,
  type SessionLockConfig,
  type SessionLockFsOps,
  type SessionLockPayload,
  type AcquireResult,
} from './session-lock';

export {
  createNdjsonEventSink,
  type INdjsonEventSink,
  type NdjsonEventSinkConfig,
  type NdjsonFsOps,
  type NdjsonLoggedEvent,
} from './ndjson-event-sink';

export {
  StaleJsonFileWriteError,
  assertJsonFileRevisionCurrent,
  createJsonFileWriteMetadata,
  createJsonFileWriterId,
  parseJsonFileWriteMetadata,
  readJsonFileRevision,
  type JsonFileRevisionGuardFsOps,
  type JsonFileWriteMetadata,
  type StaleJsonFileWriteDetails,
} from './json-file-write-guard';

export {
  parsePreferences,
  emptyPreferences,
  mergePreferences,
  type ParseResult as PreferencesParseResult,
} from './preferences-parser';

export {
  loadPreferences,
  type PreferencesLoaderConfig,
  type PreferencesFsOps,
  type LoadResult as PreferencesLoadResult,
} from './preferences-loader';

export {
  AGENT_SKILL_ROOT_DIR,
  AGENT_SKILL_SUBDIR,
  resolveAgentSkillsDir,
  resolvePersonalAgentSkillsDir,
  resolveProjectAgentSkillsDir,
} from './agent-skill-layout';
