/**
 * NekoPaths — `.neko/` directory layout resolver.
 *
 * See: docs/architecture/agent-unified-workflow.md §7.4 (project workspace)
 *
 * NekoPaths — managed `.neko/` runtime layout resolver.
 *
 * User-authored Markdown remains ordinary workspace content outside `.neko`.
 * This module only owns managed runtime state, logs, rebuildable indexes, and
 * preferences; it does not prescribe a hidden creation-document layout.
 *
 *   <root>/.neko/
 *     sessions/        AI-produced session-<runId>.md
 *     logs/            Program-produced .jsonl (events / audits / steps)
 *       conversations/<conversationId>/  Active per-conversation JSONL logs
 *     .cache/          Program-produced .json (indices, derivable)
 *     state/           Program-produced concurrency + lock files
 *     preferences.md   Project-level user preferences
 *     settings.json    Media-library variables (already used by PathResolver)
 *     settings.local.json  Local overrides (already used)
 *
 * Everything else (assets, media) lives in the media library — neko-assets
 * owns that root. This module does **not** attempt to span both.
 */

// =============================================================================
// Constants — subdirectory + filename conventions
// =============================================================================

export const NEKO_DIR = '.neko' as const;

/** Subdirectories under `.neko/`. Values are relative paths. */
export const NEKO_SUBDIRS = {
  sessions: 'sessions',
  logs: 'logs',
  cache: '.cache',
  state: 'state',
  archives: 'archives',
} as const;

export type NekoSubdir = keyof typeof NEKO_SUBDIRS;

/**
 * Canonical log-file names. Each is append-only JSONL.
 *   events.jsonl — every Agent runtime event that lands on the bus
 *   audits.jsonl — ApprovalEngine decisions (who decided what, why)
 *   steps.jsonl  — per-ReAct-step records (tool / params / outcome)
 */
export const NEKO_LOG_FILES = {
  modelCalls: 'model-calls.jsonl',
  events: 'events.jsonl',
  audits: 'audits.jsonl',
  steps: 'steps.jsonl',
} as const;

export type NekoLogFile = keyof typeof NEKO_LOG_FILES;

export const NEKO_LOG_SUBDIRS = {
  conversations: 'conversations',
} as const;

/**
 * Canonical cache-file names (under `cache/`). Program-produced JSON
 * derived from markdown artifacts and registries, safe to rebuild.
 */
export const NEKO_CACHE_FILES = {
  capabilityIndex: 'capability-index.json',
  artifactIndex: 'artifact-index.json',
} as const;

export type NekoCacheFile = keyof typeof NEKO_CACHE_FILES;

/**
 * Canonical state file names (under `state/`). Program-produced JSON
 * concurrency / lock artifacts — not human-authored.
 */
export const NEKO_STATE_FILES = {
  sessionLock: 'session-lock.json',
} as const;

export type NekoStateFile = keyof typeof NEKO_STATE_FILES;

/**
 * Canonical filename prefixes for managed markdown runtime files.
 */
export const NEKO_MD_PREFIXES = {
  session: 'session',
} as const;

// =============================================================================
// Resolver
// =============================================================================

export interface INekoPaths {
  /** Absolute path to `<root>/.neko/`. */
  readonly root: string;
  /** Absolute path to `<root>/.neko/<subdir>/`. */
  dir(subdir: NekoSubdir): string;
  /** Absolute path to a managed markdown runtime file. */
  file(subdir: 'sessions', basename: string): string;
  file(subdir: Extract<NekoSubdir, 'archives'>, basename: string): string;
  /** Absolute path to a canonical JSONL log. */
  log(kind: NekoLogFile): string;
  /** Absolute path to a conversation-owned JSONL log. */
  conversationLog(kind: NekoLogFile, conversationId: string): string;
  /** Absolute path to a canonical cache snapshot. */
  cache(kind: NekoCacheFile): string;
  /** Absolute path to a canonical program-produced state file. */
  state(kind: NekoStateFile): string;
}

/**
 * Join path segments using forward slashes. Callers working on Windows
 * typically pass forward-slash project roots already (VSCode / git); if
 * they don't, the caller should `path.resolve()` before invoking.
 */
function join(a: string, ...rest: string[]): string {
  let out = a.replace(/\/+$/, '');
  for (const seg of rest) {
    const trimmed = seg.replace(/^\/+/, '').replace(/\/+$/, '');
    if (trimmed) out = `${out}/${trimmed}`;
  }
  return out;
}

function assertSafePathSegment(value: string, label: string): string {
  const segment = value.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(segment)) {
    throw new Error(`NekoPaths: invalid ${label} path segment`);
  }
  return segment;
}

/**
 * Create a path resolver rooted at `projectRoot`. The root is recorded
 * but no filesystem calls happen here — resolution is pure string
 * math. Writers / readers take fsOps and consume paths from this.
 */
export function createNekoPaths(projectRoot: string): INekoPaths {
  if (!projectRoot) {
    throw new Error('createNekoPaths: projectRoot is required');
  }
  const root = join(projectRoot, NEKO_DIR);

  const dir = (subdir: NekoSubdir): string => join(root, NEKO_SUBDIRS[subdir]);

  function prefixFor(subdir: NekoSubdir): string | null {
    switch (subdir) {
      case 'sessions':
        return NEKO_MD_PREFIXES.session;
      case 'archives':
        return null;
      default:
        throw new Error(`No canonical prefix for subdir "${subdir}"`);
    }
  }

  function file(subdir: NekoSubdir, basename: string): string {
    if (!basename) throw new Error('NekoPaths.file: basename is required');
    const prefix = prefixFor(subdir);
    const prefixPattern = prefix ? `${prefix}-` : '';
    // Strip any accidental `.md` the caller already appended.
    const withoutExt = basename.endsWith('.md') ? basename.slice(0, -'.md'.length) : basename;
    // Strip an already-applied prefix so callers can pass either raw runId or the full name.
    const runId =
      prefix && withoutExt.startsWith(prefixPattern)
        ? withoutExt.slice(prefixPattern.length)
        : withoutExt;
    const fileName = prefix ? `${prefixPattern}${runId}.md` : `${runId}.md`;
    return `${dir(subdir)}/${fileName}`;
  }

  return {
    root,
    dir,
    file: file as INekoPaths['file'],
    log: (kind) => `${dir('logs')}/${NEKO_LOG_FILES[kind]}`,
    conversationLog: (kind, conversationId) =>
      `${dir('logs')}/${NEKO_LOG_SUBDIRS.conversations}/${assertSafePathSegment(
        conversationId,
        'conversationId',
      )}/${NEKO_LOG_FILES[kind]}`,
    cache: (kind) => `${dir('cache')}/${NEKO_CACHE_FILES[kind]}`,
    state: (kind) => `${dir('state')}/${NEKO_STATE_FILES[kind]}`,
  };
}
