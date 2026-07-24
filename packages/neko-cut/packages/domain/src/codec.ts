import { OtioValidationError, type OtioDiagnostic, type OtioParseResult } from './diagnostics';
import { readClipIdentity, readTrackIdentity, validateOpenNekoMetadata } from './metadata';
import type {
  OtioClip,
  OtioExternalReference,
  OtioGap,
  OtioLinearTimeWarp,
  OtioMetadata,
  OtioRationalTime,
  OtioStack,
  OtioTimeRange,
  OtioTimeline,
  OtioTrack,
  OtioTrackItem,
  OtioTrackKind,
} from './types';

const textDecoder = new TextDecoder('utf-8', { fatal: true });
const textEncoder = new TextEncoder();

export function parseOtio(sourceBytes: Uint8Array): OtioParseResult {
  let decoded: string;
  try {
    decoded = textDecoder.decode(sourceBytes);
  } catch {
    return failure(sourceBytes, 'invalid-json', '$', 'OTIO must be valid UTF-8 JSON.');
  }

  let value: unknown;
  try {
    value = JSON.parse(decoded);
  } catch {
    return failure(sourceBytes, 'invalid-json', '$', 'OTIO must be valid JSON.');
  }

  const diagnostics: OtioDiagnostic[] = [];
  const document = readTimeline(value, '$', diagnostics);
  if (document) validateClipIdentityGraph(document, diagnostics);
  if (!document || diagnostics.length > 0) {
    return { ok: false, diagnostics, sourceBytes };
  }
  return { ok: true, document, sourceBytes };
}

export function serializeOtio(document: OtioTimeline): Uint8Array {
  const diagnostics: OtioDiagnostic[] = [];
  const validated = readTimeline(document, '$', diagnostics);
  if (validated) validateClipIdentityGraph(validated, diagnostics);
  if (!validated || diagnostics.length > 0) {
    throw new OtioValidationError('Cannot serialize an invalid OTIO document.', diagnostics);
  }
  return textEncoder.encode(`${JSON.stringify(validated, null, 2)}\n`);
}

function validateClipIdentityGraph(document: OtioTimeline, diagnostics: OtioDiagnostic[]): void {
  const clips = new Map<
    string,
    { readonly clip: OtioClip; readonly kind: OtioTrackKind; readonly path: string }
  >();
  document.tracks.children.forEach((track, trackIndex) => {
    track.children.forEach((item, itemIndex) => {
      if (item.OTIO_SCHEMA !== 'Clip.2') return;
      const identity = readClipIdentity(item.metadata);
      if (!identity) return;
      const path = `$.tracks.children[${trackIndex}].children[${itemIndex}]`;
      const existing = clips.get(identity.clipId);
      if (existing) {
        diagnostics.push({
          code: 'invalid-value',
          path: `${path}.metadata.openneko.cut.clipId`,
          message: `Duplicate clipId ${identity.clipId}; first declared at ${existing.path}.`,
        });
        return;
      }
      clips.set(identity.clipId, { clip: item, kind: track.kind, path });
    });
  });

  for (const [clipId, entry] of clips) {
    const identity = readClipIdentity(entry.clip.metadata);
    const linkedId = identity?.linkedAudioClipId ?? identity?.linkedVideoClipId;
    if (!linkedId) continue;
    const linked = clips.get(linkedId);
    const linkField = identity?.linkedAudioClipId ? 'linkedAudioClipId' : 'linkedVideoClipId';
    const linkPath = `${entry.path}.metadata.openneko.link.${linkField}`;
    if (!linked) {
      diagnostics.push({
        code: 'invalid-value',
        path: linkPath,
        message: `Linked Clip ${linkedId} does not exist.`,
      });
      continue;
    }
    const linkedIdentity = readClipIdentity(linked.clip.metadata);
    const expectedKind: OtioTrackKind = entry.kind === 'Video' ? 'Audio' : 'Video';
    const reciprocalId =
      entry.kind === 'Video'
        ? linkedIdentity?.linkedVideoClipId
        : linkedIdentity?.linkedAudioClipId;
    if (linked.kind !== expectedKind || reciprocalId !== clipId) {
      diagnostics.push({
        code: 'invalid-value',
        path: linkPath,
        message: `Linked Clip ${linkedId} must be a reciprocal ${expectedKind} Clip.`,
      });
      continue;
    }
    if (
      entry.clip.media_reference.target_url !== linked.clip.media_reference.target_url ||
      !sameTimeRange(entry.clip.source_range, linked.clip.source_range)
    ) {
      diagnostics.push({
        code: 'invalid-value',
        path: linkPath,
        message: 'Separated Clips must reference the same media and source range.',
      });
    }
  }
}

function validateTrackIdentityGraph(
  tracks: readonly OtioTrack[],
  path: string,
  diagnostics: OtioDiagnostic[],
): void {
  const seen = new Map<string, number>();
  tracks.forEach((track, index) => {
    const identity = readTrackIdentity(track.metadata);
    if (!identity) return;
    const previous = seen.get(identity.trackId);
    if (previous !== undefined) {
      diagnostics.push({
        code: 'invalid-value',
        path: `${path}[${index}].metadata.openneko.cut.trackId`,
        message: `Duplicate trackId ${identity.trackId}; first declared at ${path}[${previous}].`,
      });
      return;
    }
    seen.set(identity.trackId, index);
  });
}

function sameTimeRange(left: OtioTimeRange, right: OtioTimeRange): boolean {
  return (
    left.start_time.value === right.start_time.value &&
    left.start_time.rate === right.start_time.rate &&
    left.duration.value === right.duration.value &&
    left.duration.rate === right.duration.rate
  );
}

function readTimeline(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): OtioTimeline | undefined {
  const record = readSchemaObject(value, 'Timeline.1', path, diagnostics);
  if (!record) return undefined;
  const name = readString(record['name'], `${path}.name`, diagnostics);
  const tracks = readStack(record['tracks'], `${path}.tracks`, diagnostics);
  const metadata = readMetadata(record['metadata'], `${path}.metadata`, diagnostics);
  const globalStart =
    record['global_start_time'] === null || record['global_start_time'] === undefined
      ? null
      : readRationalTime(record['global_start_time'], `${path}.global_start_time`, diagnostics);
  diagnostics.push(...validateOpenNekoMetadata(metadata, `${path}.metadata`, 'timeline'));
  if (!name || !tracks || (!globalStart && globalStart !== null)) return undefined;
  return {
    OTIO_SCHEMA: 'Timeline.1',
    name,
    global_start_time: globalStart,
    tracks,
    metadata,
  };
}

function readStack(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): OtioStack | undefined {
  const record = readSchemaObject(value, 'Stack.1', path, diagnostics);
  if (!record) return undefined;
  const name = readString(record['name'], `${path}.name`, diagnostics);
  const metadata = readMetadata(record['metadata'], `${path}.metadata`, diagnostics);
  validateEmptyArray(record['effects'], `${path}.effects`, diagnostics);
  validateEmptyArray(record['markers'], `${path}.markers`, diagnostics);
  diagnostics.push(...validateOpenNekoMetadata(metadata, `${path}.metadata`, 'track'));
  const values = readArray(record['children'], `${path}.children`, diagnostics);
  const children: OtioTrack[] = [];
  if (values) {
    values.forEach((child, index) => {
      const track = readTrack(child, `${path}.children[${index}]`, diagnostics);
      if (track) children.push(track);
    });
  }
  const videoCount = children.filter((track) => track.kind === 'Video').length;
  const audioCount = children.filter((track) => track.kind === 'Audio').length;
  const subtitleCount = children.filter((track) => track.kind === 'Subtitle').length;
  if (videoCount !== 1) {
    diagnostics.push({
      code: 'unsupported-structure',
      path: `${path}.children`,
      message: `Cut requires exactly one Video Track; received ${videoCount}.`,
    });
  }
  if (audioCount > 3) {
    diagnostics.push({
      code: 'unsupported-structure',
      path: `${path}.children`,
      message: `Cut allows at most three Audio Tracks; received ${audioCount}.`,
    });
  }
  if (subtitleCount > 1) {
    diagnostics.push({
      code: 'unsupported-structure',
      path: `${path}.children`,
      message: `Cut allows at most one Subtitle Track; received ${subtitleCount}.`,
    });
  }
  if (children.length > 5) {
    diagnostics.push({
      code: 'unsupported-structure',
      path: `${path}.children`,
      message: `Cut allows at most five Tracks; received ${children.length}.`,
    });
  }
  validateTrackIdentityGraph(children, `${path}.children`, diagnostics);
  if (!name || !values) return undefined;
  return {
    OTIO_SCHEMA: 'Stack.1',
    name,
    children,
    metadata,
    effects: [],
    markers: [],
  };
}

function readClipEffects(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
  trackKind: OtioTrackKind,
): readonly OtioLinearTimeWarp[] {
  if (value === undefined) return [];
  const values = readArray(value, path, diagnostics);
  if (!values) return [];
  if (values.length > 1) {
    diagnostics.push({
      code: 'unsupported-structure',
      path,
      message: 'A Clip may contain at most one LinearTimeWarp.1.',
    });
  }
  const effects: OtioLinearTimeWarp[] = [];
  values.forEach((effect, index) => {
    const effectPath = `${path}[${index}]`;
    const record = readSchemaObject(effect, 'LinearTimeWarp.1', effectPath, diagnostics);
    if (!record) return;
    if (trackKind === 'Subtitle') {
      diagnostics.push({
        code: 'unsupported-structure',
        path: effectPath,
        message: 'Subtitle Clips do not support LinearTimeWarp.',
      });
    }
    const name = readString(record['name'], `${effectPath}.name`, diagnostics);
    const effectName = readString(record['effect_name'], `${effectPath}.effect_name`, diagnostics);
    const timeScalar = readFiniteNumber(
      record['time_scalar'],
      `${effectPath}.time_scalar`,
      diagnostics,
    );
    const metadata = readMetadata(record['metadata'], `${effectPath}.metadata`, diagnostics);
    if (effectName !== undefined && effectName !== 'LinearTimeWarp') {
      diagnostics.push({
        code: 'invalid-value',
        path: `${effectPath}.effect_name`,
        message: 'LinearTimeWarp.1 effect_name must be LinearTimeWarp.',
      });
    }
    if (timeScalar !== undefined && (timeScalar < 0.25 || timeScalar > 4)) {
      diagnostics.push({
        code: 'invalid-value',
        path: `${effectPath}.time_scalar`,
        message: 'LinearTimeWarp.1 time_scalar must be between 0.25 and 4.',
      });
    }
    if (name && effectName === 'LinearTimeWarp' && timeScalar !== undefined) {
      effects.push({
        OTIO_SCHEMA: 'LinearTimeWarp.1',
        name,
        effect_name: 'LinearTimeWarp',
        time_scalar: timeScalar,
        metadata,
      });
    }
  });
  return effects;
}

function readTrack(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): OtioTrack | undefined {
  const record = readSchemaObject(value, 'Track.1', path, diagnostics);
  if (!record) return undefined;
  const name = readString(record['name'], `${path}.name`, diagnostics);
  const kind = readTrackKind(record['kind'], `${path}.kind`, diagnostics);
  const metadata = readMetadata(record['metadata'], `${path}.metadata`, diagnostics);
  if (record['enabled'] !== undefined && typeof record['enabled'] !== 'boolean') {
    diagnostics.push(invalidType(`${path}.enabled`, 'enabled must be a boolean.'));
  }
  validateEmptyArray(record['effects'], `${path}.effects`, diagnostics);
  validateEmptyArray(record['markers'], `${path}.markers`, diagnostics);
  diagnostics.push(...validateOpenNekoMetadata(metadata, `${path}.metadata`, 'track'));
  const values = readArray(record['children'], `${path}.children`, diagnostics);
  const children: OtioTrackItem[] = [];
  if (values && kind) {
    values.forEach((child, index) => {
      const item = readTrackItem(child, `${path}.children[${index}]`, diagnostics, kind);
      if (item) children.push(item);
    });
  }
  if (!name || !kind || !values) return undefined;
  return {
    OTIO_SCHEMA: 'Track.1',
    name,
    kind,
    children,
    metadata,
    enabled: record['enabled'] !== false,
    effects: [],
    markers: [],
  };
}

function readTrackItem(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
  trackKind: OtioTrackKind,
): OtioTrackItem | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalidType(path, 'Track children must be Clip.2 or Gap.1 objects.'));
    return undefined;
  }
  const schema = value['OTIO_SCHEMA'];
  if (schema === 'Clip.2') return readClip(value, path, diagnostics, trackKind);
  if (schema === 'Gap.1') return readGap(value, path, diagnostics);
  diagnostics.push({
    code: 'unsupported-schema',
    path: `${path}.OTIO_SCHEMA`,
    message: `Unsupported Track child schema: ${String(schema)}.`,
  });
  return undefined;
}

function readClip(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
  trackKind: OtioTrackKind,
): OtioClip | undefined {
  const record = readSchemaObject(value, 'Clip.2', path, diagnostics);
  if (!record) return undefined;
  const name = readString(record['name'], `${path}.name`, diagnostics);
  const mediaReference = readExternalReference(
    record['media_reference'],
    `${path}.media_reference`,
    diagnostics,
  );
  const sourceRange = readTimeRange(record['source_range'], `${path}.source_range`, diagnostics);
  const metadata = readMetadata(record['metadata'], `${path}.metadata`, diagnostics);
  const effects = readClipEffects(record['effects'], `${path}.effects`, diagnostics, trackKind);
  validateEmptyArray(record['markers'], `${path}.markers`, diagnostics);
  if (record['enabled'] !== undefined && typeof record['enabled'] !== 'boolean') {
    diagnostics.push(invalidType(`${path}.enabled`, 'enabled must be a boolean.'));
  }
  diagnostics.push(
    ...validateOpenNekoMetadata(
      metadata,
      `${path}.metadata`,
      trackKind === 'Video' ? 'video-clip' : trackKind === 'Audio' ? 'audio-clip' : 'subtitle-clip',
    ),
  );
  if (!name || !mediaReference || !sourceRange) return undefined;
  return {
    OTIO_SCHEMA: 'Clip.2',
    name,
    media_reference: mediaReference,
    source_range: sourceRange,
    metadata,
    enabled: record['enabled'] !== false,
    effects,
    markers: [],
  };
}

function readGap(value: unknown, path: string, diagnostics: OtioDiagnostic[]): OtioGap | undefined {
  const record = readSchemaObject(value, 'Gap.1', path, diagnostics);
  if (!record) return undefined;
  const name =
    record['name'] === undefined
      ? undefined
      : readString(record['name'], `${path}.name`, diagnostics);
  const sourceRange = readTimeRange(record['source_range'], `${path}.source_range`, diagnostics);
  const metadata = readMetadata(record['metadata'], `${path}.metadata`, diagnostics);
  validateEmptyArray(record['effects'], `${path}.effects`, diagnostics);
  validateEmptyArray(record['markers'], `${path}.markers`, diagnostics);
  diagnostics.push(...validateOpenNekoMetadata(metadata, `${path}.metadata`, 'gap'));
  if (!sourceRange) return undefined;
  return {
    OTIO_SCHEMA: 'Gap.1',
    ...(name ? { name } : {}),
    source_range: sourceRange,
    metadata,
    effects: [],
    markers: [],
  };
}

function readExternalReference(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): OtioExternalReference | undefined {
  const record = readSchemaObject(value, 'ExternalReference.1', path, diagnostics);
  if (!record) return undefined;
  const targetUrl = readString(record['target_url'], `${path}.target_url`, diagnostics);
  if (targetUrl && !isCanonicalDocumentRelativeTarget(targetUrl)) {
    diagnostics.push({
      code: 'invalid-value',
      path: `${path}.target_url`,
      message:
        'ExternalReference target_url must be a normalized POSIX path relative to the OTIO document.',
    });
  }
  const name =
    record['name'] === undefined
      ? undefined
      : readString(record['name'], `${path}.name`, diagnostics);
  const metadata = readMetadata(record['metadata'], `${path}.metadata`, diagnostics);
  diagnostics.push(...validateOpenNekoMetadata(metadata, `${path}.metadata`, 'media-reference'));
  const availableRange =
    record['available_range'] === undefined || record['available_range'] === null
      ? undefined
      : readTimeRange(record['available_range'], `${path}.available_range`, diagnostics);
  if (!targetUrl) return undefined;
  return {
    OTIO_SCHEMA: 'ExternalReference.1',
    ...(name ? { name } : {}),
    target_url: targetUrl,
    ...(availableRange ? { available_range: availableRange } : {}),
    metadata,
  };
}

function isCanonicalDocumentRelativeTarget(value: string): boolean {
  if (
    value.length === 0 ||
    value.includes('\\') ||
    value.includes('\0') ||
    value.startsWith('/') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  ) {
    return false;
  }
  const segments = value.split('/');
  let sawNamedSegment = false;
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.') return false;
    if (segment === '..') {
      if (sawNamedSegment) return false;
      continue;
    }
    sawNamedSegment = true;
  }
  return sawNamedSegment;
}

function readTimeRange(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): OtioTimeRange | undefined {
  const record = readSchemaObject(value, 'TimeRange.1', path, diagnostics);
  if (!record) return undefined;
  const startTime = readRationalTime(record['start_time'], `${path}.start_time`, diagnostics);
  const duration = readRationalTime(record['duration'], `${path}.duration`, diagnostics);
  if (duration && duration.value < 0) {
    diagnostics.push({
      code: 'invalid-value',
      path: `${path}.duration.value`,
      message: 'Duration cannot be negative.',
    });
  }
  if (!startTime || !duration) return undefined;
  return { OTIO_SCHEMA: 'TimeRange.1', start_time: startTime, duration };
}

function readRationalTime(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): OtioRationalTime | undefined {
  const record = readSchemaObject(value, 'RationalTime.1', path, diagnostics);
  if (!record) return undefined;
  const timeValue = readFiniteNumber(record['value'], `${path}.value`, diagnostics);
  const rate = readFiniteNumber(record['rate'], `${path}.rate`, diagnostics);
  if (rate !== undefined && rate <= 0) {
    diagnostics.push({
      code: 'invalid-value',
      path: `${path}.rate`,
      message: 'Rate must be positive.',
    });
  }
  if (timeValue === undefined || rate === undefined) return undefined;
  return { OTIO_SCHEMA: 'RationalTime.1', value: timeValue, rate };
}

function readSchemaObject(
  value: unknown,
  schema: string,
  path: string,
  diagnostics: OtioDiagnostic[],
): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    diagnostics.push(invalidType(path, `${schema} must be an object.`));
    return undefined;
  }
  if (value['OTIO_SCHEMA'] !== schema) {
    diagnostics.push({
      code: 'unsupported-schema',
      path: `${path}.OTIO_SCHEMA`,
      message: `Expected ${schema}; received ${String(value['OTIO_SCHEMA'])}.`,
    });
    return undefined;
  }
  return value;
}

function readMetadata(value: unknown, path: string, diagnostics: OtioDiagnostic[]): OtioMetadata {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    diagnostics.push(invalidType(path, 'metadata must be an object.'));
    return {};
  }
  return value;
}

function readTrackKind(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): OtioTrackKind | undefined {
  if (value === 'Video' || value === 'Audio' || value === 'Subtitle') return value;
  diagnostics.push({
    code: 'invalid-value',
    path,
    message: 'Track kind must be Video, Audio or Subtitle.',
  });
  return undefined;
}

function readString(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): string | undefined {
  if (typeof value === 'string') return value;
  diagnostics.push(invalidType(path, 'Expected a string.'));
  return undefined;
}

function readFiniteNumber(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  diagnostics.push(invalidType(path, 'Expected a finite number.'));
  return undefined;
}

function readArray(
  value: unknown,
  path: string,
  diagnostics: OtioDiagnostic[],
): readonly unknown[] | undefined {
  if (Array.isArray(value)) return value;
  diagnostics.push(invalidType(path, 'Expected an array.'));
  return undefined;
}

function validateEmptyArray(value: unknown, path: string, diagnostics: OtioDiagnostic[]): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(invalidType(path, 'Expected an array.'));
    return;
  }
  if (value.length > 0) {
    diagnostics.push({
      code: 'unsupported-structure',
      path,
      message: 'Effects and markers are outside the lightweight Cut profile.',
    });
  }
}

function invalidType(path: string, message: string): OtioDiagnostic {
  return { code: 'invalid-type', path, message };
}

function failure(
  sourceBytes: Uint8Array,
  code: OtioDiagnostic['code'],
  path: string,
  message: string,
): OtioParseResult {
  return { ok: false, diagnostics: [{ code, path, message }], sourceBytes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
