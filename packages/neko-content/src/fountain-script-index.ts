import type {
  FountainCharacterEntry,
  FountainSceneEntry,
  FountainScriptIndex,
  SemanticSourceDescriptor,
  SemanticTextSegment,
} from '@neko/shared';
import { extractSemanticText } from './semantic-text';

export function buildFountainScriptIndex(input: {
  readonly uri: string;
  readonly content: string | Uint8Array;
}): FountainScriptIndex {
  const text = decodeFountainContent(input.content);
  const segments = extractSemanticText({
    source: createFountainSourceDescriptor(input.uri, text),
    content: text,
  });
  const sceneStarts = segments
    .map((segment, index) => ({ segment, index }))
    .filter((entry) => entry.segment.kind === 'fountain-scene');
  const scenes = sceneStarts.map((entry, sceneIndex) =>
    buildSceneEntry(
      entry.segment,
      segments.slice(entry.index + 1, sceneStarts[sceneIndex + 1]?.index ?? segments.length),
      sceneIndex,
    ),
  );
  return {
    uri: input.uri,
    total_lines: countLines(text),
    scenes,
    characters: buildCharacterEntries(segments, scenes),
  };
}

function createFountainSourceDescriptor(uri: string, content: string): SemanticSourceDescriptor {
  const sizeBytes = new TextEncoder().encode(content).byteLength;
  return {
    sourceId: `fountain:${uri}`,
    workspaceId: 'fountain-script-index',
    rootId: 'source',
    rootKind: 'workspace',
    relativePath: uri,
    portablePath: uri,
    format: 'fountain',
    analysisMode: 'discover-candidates',
    fingerprint: `bytes:${sizeBytes}`,
    sizeBytes,
    modifiedAtMs: 0,
  };
}

function buildSceneEntry(
  headingSegment: SemanticTextSegment,
  body: readonly SemanticTextSegment[],
  ordinal: number,
): FountainSceneEntry {
  const heading = headingSegment.text;
  const parsed = parseHeading(heading);
  const sceneId = `scene-${ordinal + 1}-${stableSlug(heading)}`;
  const actionSummary = body
    .filter((segment) => segment.kind === 'fountain-action')
    .map((segment) => segment.text)
    .join(' ')
    .slice(0, 240);
  const sceneCharacters = uniqueStrings(
    body
      .filter((segment) => segment.kind === 'fountain-character')
      .map((segment) => segment.explicitEntityName ?? segment.text),
  );
  return {
    id: sceneId,
    heading,
    sceneId,
    sceneTitle: heading,
    intExt: parsed.intExt,
    timeOfDay: parsed.timeOfDay,
    location: parsed.location,
    time: parsed.timeOfDay,
    sceneNumber: parsed.sceneNumber,
    sceneCharacters,
    actionSummary,
    estimatedDuration: Math.max(1, body.length * 2),
    directives: [],
    line_start: Math.max(0, (headingSegment.range.startLine ?? 1) - 1),
    line_end: Math.max(
      0,
      ((body.at(-1)?.range.endLine ?? headingSegment.range.endLine ?? 1) as number) - 1,
    ),
  };
}

function buildCharacterEntries(
  segments: readonly SemanticTextSegment[],
  scenes: readonly FountainSceneEntry[],
): readonly FountainCharacterEntry[] {
  const entries = new Map<string, { firstLine: number; sceneIds: Set<string> }>();
  for (const segment of segments) {
    if (segment.kind !== 'fountain-character') continue;
    const name = segment.explicitEntityName ?? segment.text;
    const line = Math.max(0, (segment.range.startLine ?? 1) - 1);
    const scene = scenes.find(
      (candidate) => line >= candidate.line_start && line <= candidate.line_end,
    );
    const entry = entries.get(name) ?? { firstLine: line, sceneIds: new Set<string>() };
    entry.firstLine = Math.min(entry.firstLine, line);
    if (scene) entry.sceneIds.add(scene.sceneId);
    entries.set(name, entry);
  }
  return [...entries.entries()].map(([name, entry]) => ({
    name,
    first_line: entry.firstLine,
    scene_ids: [...entry.sceneIds],
  }));
}

function parseHeading(heading: string): {
  readonly intExt: string | null;
  readonly location: string;
  readonly timeOfDay: string | null;
  readonly sceneNumber: string | null;
} {
  const sceneNumberMatch = heading.match(/\s+#([^#]+)#\s*$/);
  const withoutNumber = sceneNumberMatch
    ? heading.slice(0, sceneNumberMatch.index).trim()
    : heading;
  const prefixMatch = withoutNumber.match(/^(INT\.?\/EXT\.?|I\.?\/E\.?|INT\.?|EXT\.?)\s+/i);
  const intExt = prefixMatch?.[1]?.replace(/\./g, '').toUpperCase() ?? null;
  const body = prefixMatch ? withoutNumber.slice(prefixMatch[0].length) : withoutNumber;
  const separator = body.lastIndexOf(' - ');
  return {
    intExt,
    location: (separator >= 0 ? body.slice(0, separator) : body).trim(),
    timeOfDay: separator >= 0 ? body.slice(separator + 3).trim() || null : null,
    sceneNumber: sceneNumberMatch?.[1]?.trim() ?? null,
  };
}

function decodeFountainContent(content: string | Uint8Array): string {
  return typeof content === 'string'
    ? content
    : new TextDecoder('utf-8', { fatal: true }).decode(content);
}

function countLines(content: string): number {
  return content.length === 0 ? 0 : content.split(/\r?\n/).length;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function stableSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug) return slug;
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
