import { Fountain, type Token } from 'fountain-js';
import {
  DEFAULT_FOUNTAIN_MAX_SOURCE_CODE_UNITS,
  type FountainParsePolicy,
  type FountainParseResult,
  type ScreenplayCharacter,
  type ScreenplayDiagnostic,
  type ScreenplayElement,
  type ScreenplayElementKind,
  type ScreenplayOutlineEntry,
  type ScreenplayScene,
  type ScreenplaySourcePosition,
  type ScreenplaySourceRange,
} from './contracts';

const TOKEN_KINDS: Readonly<Record<string, ScreenplayElementKind | undefined>> = {
  scene_heading: 'scene-heading',
  action: 'action',
  character: 'character',
  dialogue: 'dialogue',
  parenthetical: 'parenthetical',
  transition: 'transition',
  section: 'section',
  synopsis: 'synopsis',
  note: 'note',
  centered: 'centered',
  lyrics: 'lyrics',
  page_break: 'page-break',
};

export function parseFountainDocument(
  source: string,
  sourceId: string,
  policy: FountainParsePolicy = {},
): FountainParseResult {
  const maxSourceCodeUnits = policy.maxSourceCodeUnits ?? DEFAULT_FOUNTAIN_MAX_SOURCE_CODE_UNITS;
  if (!Number.isSafeInteger(maxSourceCodeUnits) || maxSourceCodeUnits <= 0) {
    throw new RangeError('Fountain maxSourceCodeUnits must be a positive safe integer.');
  }
  if (source.length > maxSourceCodeUnits) {
    return failed({
      code: 'fountain-source-too-large',
      severity: 'error',
      parameters: { actual: source.length, limit: maxSourceCodeUnits },
    });
  }

  let parsed: ReturnType<Fountain['parse']>;
  try {
    parsed = new Fountain().parse(source, true);
  } catch {
    return failed({ code: 'fountain-parser-failed', severity: 'error' });
  }

  const associated = associateTokens(source, parsed.tokens);
  if (!associated) {
    return failed({ code: 'fountain-source-association-failed', severity: 'error' });
  }
  const diagnostics = collectDiagnostics(source, associated);
  const scenes = projectScenes(associated);
  const characters = projectCharacters(associated, scenes);
  return {
    status: 'ready',
    document: Object.freeze({
      sourceId,
      source,
      ...(parsed.title ? { title: parsed.title } : {}),
      elements: Object.freeze(associated),
      scenes: Object.freeze(scenes),
      characters: Object.freeze(characters),
      outline: Object.freeze(projectOutline(associated)),
      diagnostics: Object.freeze(diagnostics),
    }),
  };
}

function associateTokens(
  source: string,
  tokens: readonly Token[],
): readonly ScreenplayElement[] | undefined {
  const elements: ScreenplayElement[] = [];
  let cursor = 0;
  let dialogueOwner: string | undefined;
  for (const token of tokens) {
    if (token.type === 'dialogue_end') dialogueOwner = undefined;
    const kind = token.is_title ? 'title-page' : TOKEN_KINDS[token.type];
    if (!kind) continue;
    const association = associateToken(source, token, kind, cursor);
    if (!association) return undefined;
    cursor = association.nextCursor;
    const owner = kind === 'character' ? association.text : dialogueOwner;
    if (kind === 'character') dialogueOwner = association.text;
    elements.push(
      Object.freeze({
        elementId: `element:${elements.length}`,
        kind,
        text: association.text,
        range: association.range,
        ...(token.scene_number ? { sceneNumber: token.scene_number } : {}),
        ...(token.depth === undefined ? {} : { sectionDepth: token.depth }),
        ...(owner === undefined || kind === 'character' ? {} : { dialogueOwner: owner }),
      }),
    );
  }
  return elements;
}

function associateToken(
  source: string,
  token: Token,
  kind: ScreenplayElementKind,
  cursor: number,
):
  | { readonly text: string; readonly range: ScreenplaySourceRange; readonly nextCursor: number }
  | undefined {
  if (kind === 'page-break') {
    const match = /^(?:\s*)={3,}(?:\s*)$/m.exec(source.slice(cursor));
    if (!match || match.index === undefined) return undefined;
    const start = cursor + match.index;
    const end = start + match[0].length;
    return { text: match[0].trim(), range: rangeFor(source, start, end), nextCursor: end };
  }
  const text = token.text?.trim();
  if (!text) return undefined;
  const start = findTokenText(source, text, cursor);
  if (start < 0) return undefined;
  const end = start + text.length;
  return { text, range: rangeFor(source, start, end), nextCursor: end };
}

function findTokenText(source: string, text: string, cursor: number): number {
  const exact = source.indexOf(text, cursor);
  if (exact >= 0) return exact;
  const normalizedText = text.replace(/\r\n/g, '\n');
  const normalizedSource = source.slice(cursor).replace(/\r\n/g, '\n');
  const normalized = normalizedSource.indexOf(normalizedText);
  if (normalized < 0) return -1;
  return (
    cursor + sourceOffsetFromNormalized(normalizedSource.slice(0, normalized), source.slice(cursor))
  );
}

function sourceOffsetFromNormalized(normalizedPrefix: string, source: string): number {
  let normalizedOffset = 0;
  for (let sourceOffset = 0; sourceOffset < source.length; sourceOffset += 1) {
    if (normalizedOffset === normalizedPrefix.length) return sourceOffset;
    if (source[sourceOffset] === '\r' && source[sourceOffset + 1] === '\n') continue;
    normalizedOffset += 1;
  }
  return source.length;
}

function collectDiagnostics(
  source: string,
  elements: readonly ScreenplayElement[],
): readonly ScreenplayDiagnostic[] {
  const diagnostics: ScreenplayDiagnostic[] = [];
  const sceneNumbers = new Map<string, ScreenplayElement>();
  for (const element of elements) {
    if (!element.sceneNumber) continue;
    if (sceneNumbers.has(element.sceneNumber)) {
      diagnostics.push({
        code: 'fountain-duplicate-scene-number',
        severity: 'warning',
        range: element.range,
        parameters: { sceneNumber: element.sceneNumber },
      });
    } else {
      sceneNumbers.set(element.sceneNumber, element);
    }
  }
  for (const line of sourceLines(source)) {
    const trimmed = line.text.trim();
    if (
      /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{1,20}$/u.test(
        trimmed,
      )
    ) {
      const next = sourceLines(source).find(
        (candidate) => candidate.start > line.end && candidate.text.trim(),
      );
      if (
        next &&
        !trimmed.startsWith('@') &&
        !elements.some(
          (element) => element.kind === 'character' && contains(element.range, line.start),
        )
      ) {
        diagnostics.push({
          code: 'fountain-cjk-character-cue-unforced',
          severity: 'warning',
          range: rangeFor(source, line.start, line.end),
        });
      }
    }
    if (/^(?:内景|外景|內景)\s/u.test(trimmed) && !trimmed.startsWith('.')) {
      diagnostics.push({
        code: 'fountain-cjk-scene-heading-unforced',
        severity: 'warning',
        range: rangeFor(source, line.start, line.end),
      });
    }
  }
  return diagnostics;
}

function projectScenes(elements: readonly ScreenplayElement[]): readonly ScreenplayScene[] {
  const sceneStarts = elements
    .map((element, index) => ({ element, index }))
    .filter(({ element }) => element.kind === 'scene-heading');
  return sceneStarts.map(({ element, index }, ordinal) => {
    const body = elements.slice(index, sceneStarts[ordinal + 1]?.index ?? elements.length);
    const last = body.at(-1) ?? element;
    const heading = parseSceneHeading(element.text);
    return Object.freeze({
      sceneId: `scene:${ordinal}`,
      heading: element.text,
      ...(element.sceneNumber ? { sceneNumber: element.sceneNumber } : {}),
      ...(heading.intExt ? { intExt: heading.intExt } : {}),
      location: heading.location,
      ...(heading.timeOfDay ? { timeOfDay: heading.timeOfDay } : {}),
      range: { start: element.range.start, end: last.range.end },
      elementIds: Object.freeze(body.map((candidate) => candidate.elementId)),
      characters: Object.freeze([
        ...new Set(
          body
            .filter((candidate) => candidate.kind === 'character')
            .map((candidate) => candidate.text),
        ),
      ]),
    });
  });
}

function parseSceneHeading(value: string): {
  readonly intExt?: string;
  readonly location: string;
  readonly timeOfDay?: string;
} {
  const separator = value.lastIndexOf(' - ');
  const left = separator < 0 ? value : value.slice(0, separator);
  const timeOfDay = separator < 0 ? undefined : value.slice(separator + 3).trim() || undefined;
  const prefixes = ['INT./EXT.', 'INT/EXT.', 'INT.', 'EXT.', 'EST.', 'I/E.'] as const;
  const prefix = prefixes.find((candidate) => left.toUpperCase().startsWith(`${candidate} `));
  return {
    ...(prefix ? { intExt: prefix.replaceAll('.', '') } : {}),
    location: (prefix ? left.slice(prefix.length) : left).trim(),
    ...(timeOfDay ? { timeOfDay } : {}),
  };
}

function projectCharacters(
  elements: readonly ScreenplayElement[],
  scenes: readonly ScreenplayScene[],
): readonly ScreenplayCharacter[] {
  const characters = new Map<string, { ranges: ScreenplaySourceRange[]; sceneIds: Set<string> }>();
  for (const element of elements) {
    if (element.kind !== 'character') continue;
    const value = characters.get(element.text) ?? { ranges: [], sceneIds: new Set<string>() };
    value.ranges.push(element.range);
    const scene = scenes.find((candidate) => contains(candidate.range, element.range.start.offset));
    if (scene) value.sceneIds.add(scene.sceneId);
    characters.set(element.text, value);
  }
  return [...characters.entries()].map(([name, value]) =>
    Object.freeze({
      name,
      ranges: Object.freeze(value.ranges),
      sceneIds: Object.freeze([...value.sceneIds]),
    }),
  );
}

function projectOutline(elements: readonly ScreenplayElement[]): readonly ScreenplayOutlineEntry[] {
  return elements.flatMap((element) => {
    if (element.kind !== 'scene-heading' && element.kind !== 'section') return [];
    return [
      Object.freeze({
        outlineId: `outline:${element.elementId}`,
        kind: element.kind === 'section' ? 'section' : 'scene',
        label: element.text,
        range: element.range,
        depth: element.kind === 'section' ? (element.sectionDepth ?? 1) : 0,
      }),
    ];
  });
}

function sourceLines(source: string): readonly { text: string; start: number; end: number }[] {
  const lines: { text: string; start: number; end: number }[] = [];
  const pattern = /.*(?:\r\n|\n|$)/g;
  for (const match of source.matchAll(pattern)) {
    if (match.index === undefined || (match[0] === '' && match.index === source.length)) continue;
    const text = match[0].replace(/\r?\n$/, '');
    lines.push({ text, start: match.index, end: match.index + text.length });
  }
  return lines;
}

function rangeFor(source: string, start: number, end: number): ScreenplaySourceRange {
  return { start: positionFor(source, start), end: positionFor(source, end) };
}

function positionFor(source: string, offset: number): ScreenplaySourcePosition {
  const prefix = source.slice(0, offset);
  const lines = prefix.split(/\r?\n/);
  return { offset, line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function contains(range: ScreenplaySourceRange, offset: number): boolean {
  return offset >= range.start.offset && offset <= range.end.offset;
}

function failed(diagnostic: ScreenplayDiagnostic): FountainParseResult {
  return { status: 'failed', diagnostics: Object.freeze([diagnostic]) };
}
