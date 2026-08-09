export const DEFAULT_FOUNTAIN_MAX_SOURCE_CODE_UNITS = 1_000_000;

export interface ScreenplaySourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface ScreenplaySourceRange {
  readonly start: ScreenplaySourcePosition;
  readonly end: ScreenplaySourcePosition;
}

export type ScreenplayElementKind =
  | 'title-page'
  | 'scene-heading'
  | 'action'
  | 'character'
  | 'dialogue'
  | 'parenthetical'
  | 'transition'
  | 'section'
  | 'synopsis'
  | 'note'
  | 'centered'
  | 'lyrics'
  | 'page-break';

export interface ScreenplayElement {
  readonly elementId: string;
  readonly kind: ScreenplayElementKind;
  readonly text: string;
  readonly range: ScreenplaySourceRange;
  readonly sceneNumber?: string;
  readonly sectionDepth?: number;
  readonly dialogueOwner?: string;
}

export interface ScreenplayScene {
  readonly sceneId: string;
  readonly heading: string;
  readonly sceneNumber?: string;
  readonly intExt?: string;
  readonly location: string;
  readonly timeOfDay?: string;
  readonly range: ScreenplaySourceRange;
  readonly elementIds: readonly string[];
  readonly characters: readonly string[];
}

export interface FountainSceneEntry {
  readonly id: string;
  readonly heading: string;
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly intExt: string | null;
  readonly timeOfDay: string | null;
  readonly location: string;
  readonly time: string | null;
  readonly sceneNumber: string | null;
  readonly sceneCharacters: readonly string[];
  readonly actionSummary: string;
  readonly estimatedDuration: number;
  readonly directives: readonly {
    readonly category: string;
    readonly key: string;
    readonly value: string;
  }[];
  readonly line_start: number;
  readonly line_end: number;
}

export interface FountainCharacterEntry {
  readonly name: string;
  readonly first_line: number;
  readonly scene_ids: readonly string[];
}

export interface FountainScriptIndex {
  readonly uri: string;
  readonly total_lines: number;
  readonly scenes: readonly FountainSceneEntry[];
  readonly characters: readonly FountainCharacterEntry[];
}

export interface ScreenplayCharacter {
  readonly name: string;
  readonly ranges: readonly ScreenplaySourceRange[];
  readonly sceneIds: readonly string[];
}

export interface ScreenplayOutlineEntry {
  readonly outlineId: string;
  readonly kind: 'scene' | 'section';
  readonly label: string;
  readonly range: ScreenplaySourceRange;
  readonly depth: number;
}

export type ScreenplayDiagnosticCode =
  | 'fountain-source-too-large'
  | 'fountain-parser-failed'
  | 'fountain-source-association-failed'
  | 'fountain-cjk-character-cue-unforced'
  | 'fountain-cjk-scene-heading-unforced'
  | 'fountain-duplicate-scene-number';

export interface ScreenplayDiagnostic {
  readonly code: ScreenplayDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly range?: ScreenplaySourceRange;
  readonly parameters?: Readonly<Record<string, string | number>>;
}

export interface FountainDocument {
  readonly sourceId: string;
  readonly source: string;
  readonly title?: string;
  readonly elements: readonly ScreenplayElement[];
  readonly scenes: readonly ScreenplayScene[];
  readonly characters: readonly ScreenplayCharacter[];
  readonly outline: readonly ScreenplayOutlineEntry[];
  readonly diagnostics: readonly ScreenplayDiagnostic[];
}

export type FountainParseResult =
  | { readonly status: 'ready'; readonly document: FountainDocument }
  | { readonly status: 'failed'; readonly diagnostics: readonly ScreenplayDiagnostic[] };

export interface FountainParsePolicy {
  readonly maxSourceCodeUnits?: number;
}
