/**
 * preferences-parser — markdown → UserPreferences.
 *
 * See: docs/architecture/agent-unified-workflow.md §9.3
 *
 * The parser is deliberately **narrow**. Users write freeform markdown,
 * but only a fixed set of `## Heading` sections drive runtime behaviour;
 * everything else is preserved verbatim for the UI.
 *
 * Recognised sections (case-insensitive, heading text match):
 *   - `## Always approve`      → list of subject matchers → alwaysApprove
 *   - `## Auto approve`        → subject matchers → autoApprove
 *   - `## Cost thresholds`     → `- maxTokens > N` / `- maxUsd > N` etc.
 *   - `## Default mode`        → value `auto` | `plan` in paragraph body
 *   - `## Default skills`      → list of skill ids
 *
 * Subject bullet syntax (in alwaysApprove / autoApprove sections):
 *   - `- tool:<name>`          exact tool match
 *   - `- domain:<name>`        domain tag match
 *   - `- channel:<name>`       channel name match
 *   - `- *`                    wildcard
 *   - `- <free text>`          label substring fallback
 *
 * Threshold bullet syntax (in cost thresholds):
 *   - `- maxTokens > 50000`
 *   - `- maxUsd > 5`
 *   - `- maxDurationMs > 1800000`    (raw ms)
 *   - `- maxDurationMs > 30m`        (suffix: s/m/h)
 *
 * Unrecognised bullets in known sections are logged (via return value,
 * not thrown) so a typo in the user's MD doesn't brick their agent.
 */

import type {
  UserPreferences,
  PreferenceSubjectRule,
  PreferenceCostThresholds,
} from '@neko-agent/types';

// =============================================================================
// Result type
// =============================================================================

export interface ParseResult {
  preferences: UserPreferences;
  /**
   * Non-fatal diagnostics — unrecognised bullets, malformed thresholds,
   * unexpected frontmatter. Callers may log these or surface them in UI.
   */
  warnings: readonly string[];
}

// =============================================================================
// Parser
// =============================================================================

const RECOGNISED_SECTIONS = new Set([
  'always approve',
  'auto approve',
  'cost thresholds',
  'default mode',
  'default skills',
]);

const MODE_VALUES = new Set(['auto', 'plan']);

export function parsePreferences(
  markdown: string,
  scope: 'project' | 'global',
  sourcePath: string,
): ParseResult {
  const warnings: string[] = [];

  const { frontmatter, body } = _splitFrontmatter(markdown);
  const version = _parseVersion(frontmatter, warnings);
  const declaredScope = _parseScope(frontmatter, warnings);
  if (declaredScope && declaredScope !== scope) {
    warnings.push(
      `preferences scope mismatch: file declares "${declaredScope}" but loader treats it as "${scope}"`,
    );
  }

  const sections = _splitSections(body);

  const alwaysApprove: PreferenceSubjectRule[] = [];
  const autoApprove: PreferenceSubjectRule[] = [];
  const costThresholds: PreferenceCostThresholds = {};
  let defaultMode: UserPreferences['defaultMode'];
  const defaultSkills: string[] = [];
  const freeFormSections: Record<string, string> = {};

  for (const { heading, content } of sections) {
    const key = heading.toLowerCase();
    if (!RECOGNISED_SECTIONS.has(key)) {
      freeFormSections[heading] = content;
      continue;
    }

    switch (key) {
      case 'always approve':
        for (const line of _bullets(content)) {
          const rule = _parseSubjectRule(line);
          if (rule) alwaysApprove.push(rule);
          else warnings.push(`Unrecognised always-approve bullet: "${line}"`);
        }
        break;
      case 'auto approve':
        for (const line of _bullets(content)) {
          const rule = _parseSubjectRule(line);
          if (rule) autoApprove.push(rule);
          else warnings.push(`Unrecognised auto-approve bullet: "${line}"`);
        }
        break;
      case 'cost thresholds':
        for (const line of _bullets(content)) {
          if (!_parseThresholdInto(line, costThresholds)) {
            warnings.push(`Unrecognised cost-threshold bullet: "${line}"`);
          }
        }
        break;
      case 'default mode':
        defaultMode = _parseDefaultMode(content, warnings);
        break;
      case 'default skills':
        for (const line of _bullets(content)) {
          const trimmed = line.trim();
          if (trimmed.length > 0) defaultSkills.push(trimmed);
        }
        break;
    }
  }

  const preferences: UserPreferences = {
    scope,
    version,
    alwaysApprove,
    autoApprove,
    costThresholds,
    defaultSkills,
    freeFormSections,
    sourcePath,
    ...(defaultMode ? { defaultMode } : {}),
  };
  return { preferences, warnings };
}

// =============================================================================
// Empty default (when file absent)
// =============================================================================

export function emptyPreferences(scope: 'project' | 'global', sourcePath = ''): UserPreferences {
  return {
    scope,
    version: 1,
    alwaysApprove: [],
    autoApprove: [],
    costThresholds: {},
    defaultSkills: [],
    freeFormSections: {},
    sourcePath,
  };
}

// =============================================================================
// Merge
// =============================================================================

/**
 * Project-over-global merge. Semantics:
 *   - scalars: project wins when set
 *   - lists:   concatenated with project entries first (precedence on
 *              dedupe)
 *   - thresholds: per-field project-over-global (project's omitted
 *              field falls back to global's)
 *   - freeFormSections: project overrides global for colliding headings
 *              (explicit override); non-colliding entries union
 */
export function mergePreferences(
  project: UserPreferences | null,
  global: UserPreferences | null,
): UserPreferences {
  if (!project && !global) return emptyPreferences('project');
  if (!project) return { ...global!, scope: 'project' };
  if (!global) return project;

  const alwaysApprove = _dedupeRules([...project.alwaysApprove, ...global.alwaysApprove]);
  const autoApprove = _dedupeRules([...project.autoApprove, ...global.autoApprove]);
  const defaultSkills = _dedupeStrings([...project.defaultSkills, ...global.defaultSkills]);

  const costThresholds: PreferenceCostThresholds = {
    ...(global.costThresholds.maxTokens !== undefined
      ? { maxTokens: global.costThresholds.maxTokens }
      : {}),
    ...(global.costThresholds.maxUsd !== undefined ? { maxUsd: global.costThresholds.maxUsd } : {}),
    ...(global.costThresholds.maxDurationMs !== undefined
      ? { maxDurationMs: global.costThresholds.maxDurationMs }
      : {}),
    ...(project.costThresholds.maxTokens !== undefined
      ? { maxTokens: project.costThresholds.maxTokens }
      : {}),
    ...(project.costThresholds.maxUsd !== undefined
      ? { maxUsd: project.costThresholds.maxUsd }
      : {}),
    ...(project.costThresholds.maxDurationMs !== undefined
      ? { maxDurationMs: project.costThresholds.maxDurationMs }
      : {}),
  };

  const freeFormSections: Record<string, string> = {
    ...global.freeFormSections,
    ...project.freeFormSections,
  };

  const merged: UserPreferences = {
    scope: 'project',
    version: project.version,
    alwaysApprove,
    autoApprove,
    costThresholds,
    defaultSkills,
    freeFormSections,
    sourcePath: project.sourcePath,
    ...(project.defaultMode
      ? { defaultMode: project.defaultMode }
      : global.defaultMode
        ? { defaultMode: global.defaultMode }
        : {}),
  };
  return merged;
}

// =============================================================================
// Internals
// =============================================================================

function _splitFrontmatter(md: string): { frontmatter: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!match) return { frontmatter: '', body: md };
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' };
}

function _parseVersion(frontmatter: string, warnings: string[]): number {
  const match = /^version:\s*(.+)$/m.exec(frontmatter);
  if (!match) return 1;
  const parsed = Number(match[1]!.trim());
  if (Number.isNaN(parsed) || parsed <= 0) {
    warnings.push(`Invalid preferences version "${match[1]}"; defaulting to 1`);
    return 1;
  }
  return parsed;
}

function _parseScope(frontmatter: string, warnings: string[]): 'project' | 'global' | null {
  const match = /^scope:\s*(.+)$/m.exec(frontmatter);
  if (!match) return null;
  const value = match[1]!.trim();
  if (value === 'project' || value === 'global') return value;
  warnings.push(`Invalid preferences scope "${value}"; ignoring`);
  return null;
}

interface Section {
  heading: string;
  content: string;
}

function _splitSections(body: string): Section[] {
  const out: Section[] = [];
  const regex = /^##\s+(.+?)\s*$/gm;
  const matches = [...body.matchAll(regex)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : body.length;
    out.push({
      heading: m[1]!.trim(),
      content: body.slice(start, end).trim(),
    });
  }
  return out;
}

function _bullets(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

function _parseSubjectRule(line: string): PreferenceSubjectRule | null {
  if (line.length === 0) return null;
  if (line === '*') {
    return { kind: 'any', value: '', source: line };
  }
  const prefixed = /^(tool|domain|channel|label):\s*(.+)$/i.exec(line);
  if (prefixed) {
    const kindRaw = prefixed[1]!.toLowerCase();
    const value = prefixed[2]!.trim();
    if (value.length === 0) return null;
    return { kind: kindRaw as PreferenceSubjectRule['kind'], value, source: line };
  }
  // Fallback — treat as label substring match.
  return { kind: 'label', value: line, source: line };
}

function _parseThresholdInto(line: string, out: PreferenceCostThresholds): boolean {
  const match = /^(maxTokens|maxUsd|maxDurationMs)\s*>\s*(.+)$/.exec(line);
  if (!match) return false;
  const field = match[1] as keyof PreferenceCostThresholds;
  const raw = match[2]!.trim();
  const value = _parseNumberWithUnit(raw);
  if (value === null) return false;
  out[field] = value;
  return true;
}

function _parseNumberWithUnit(raw: string): number | null {
  const unitMatch = /^([\d.]+)\s*(ms|s|m|h)?$/i.exec(raw);
  if (!unitMatch) return null;
  const num = Number(unitMatch[1]);
  if (Number.isNaN(num)) return null;
  const unit = unitMatch[2]?.toLowerCase();
  switch (unit) {
    case 'h':
      return num * 3_600_000;
    case 'm':
      return num * 60_000;
    case 's':
      return num * 1_000;
    case 'ms':
    case undefined:
      return num;
    default:
      return null;
  }
}

function _parseDefaultMode(content: string, warnings: string[]): UserPreferences['defaultMode'] {
  const value = content.trim().toLowerCase();
  if (MODE_VALUES.has(value)) return value as UserPreferences['defaultMode'];
  warnings.push(`Invalid default mode "${content.trim()}"; expected "auto" or "plan"`);
  return undefined;
}

function _dedupeRules(rules: PreferenceSubjectRule[]): PreferenceSubjectRule[] {
  const seen = new Set<string>();
  const out: PreferenceSubjectRule[] = [];
  for (const r of rules) {
    const key = `${r.kind}:${r.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function _dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
