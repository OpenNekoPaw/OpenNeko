export type TextEditorPresentationMode = 'rich' | 'source' | 'preview' | 'split';

export interface TextEditorPresentationSnapshot {
  readonly mode: TextEditorPresentationMode;
  readonly selection: { readonly anchor: number; readonly head: number };
  readonly scrollTop: number;
  readonly splitRatio: number;
  readonly outlineVisible: boolean;
}

export interface TextEditorPresentationSnapshotParseResult {
  readonly snapshot: TextEditorPresentationSnapshot;
  readonly diagnostic?: 'text-editor-presentation-snapshot-invalid';
}

export function createDefaultTextEditorPresentationSnapshot(): TextEditorPresentationSnapshot {
  return {
    mode: 'source',
    selection: { anchor: 0, head: 0 },
    scrollTop: 0,
    splitRatio: 0.5,
    outlineVisible: true,
  };
}

export function parseTextEditorPresentationSnapshot(
  value: unknown,
): TextEditorPresentationSnapshotParseResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['mode', 'selection', 'scrollTop', 'splitRatio', 'outlineVisible'])
  ) {
    return invalidSnapshot();
  }
  const selection = value['selection'];
  if (
    (value['mode'] !== 'rich' &&
      value['mode'] !== 'source' &&
      value['mode'] !== 'preview' &&
      value['mode'] !== 'split') ||
    !isRecord(selection) ||
    !hasExactKeys(selection, ['anchor', 'head']) ||
    !isNonNegativeInteger(selection['anchor']) ||
    !isNonNegativeInteger(selection['head']) ||
    typeof value['scrollTop'] !== 'number' ||
    !Number.isFinite(value['scrollTop']) ||
    value['scrollTop'] < 0 ||
    typeof value['splitRatio'] !== 'number' ||
    value['splitRatio'] < 0.25 ||
    value['splitRatio'] > 0.75 ||
    typeof value['outlineVisible'] !== 'boolean'
  ) {
    return invalidSnapshot();
  }
  return {
    snapshot: {
      mode: value['mode'],
      selection: { anchor: selection['anchor'], head: selection['head'] },
      scrollTop: value['scrollTop'],
      splitRatio: value['splitRatio'],
      outlineVisible: value['outlineVisible'],
    },
  };
}

function invalidSnapshot(): TextEditorPresentationSnapshotParseResult {
  return {
    snapshot: createDefaultTextEditorPresentationSnapshot(),
    diagnostic: 'text-editor-presentation-snapshot-invalid',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0;
}
