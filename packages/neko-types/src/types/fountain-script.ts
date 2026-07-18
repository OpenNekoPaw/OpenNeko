/** Structured representation of a scene in a Fountain screenplay. */
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

/** Aggregated character information within one Fountain file. */
export interface FountainCharacterEntry {
  readonly name: string;
  readonly first_line: number;
  readonly scene_ids: readonly string[];
}

/** Host-neutral index built directly from Fountain text. */
export interface FountainScriptIndex {
  readonly uri: string;
  readonly total_lines: number;
  readonly scenes: readonly FountainSceneEntry[];
  readonly characters: readonly FountainCharacterEntry[];
}

/** Minimal structural representation used by retained text projections. */
export interface FountainParsedScript {
  readonly title?: string;
  readonly elements: ReadonlyArray<{
    readonly type: string;
    readonly text: string;
    readonly [key: string]: unknown;
  }>;
}
