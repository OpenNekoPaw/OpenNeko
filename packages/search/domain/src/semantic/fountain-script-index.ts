import {
  parseFountainDocument,
  type FountainCharacterEntry,
  type FountainDocument,
  type FountainSceneEntry,
  type FountainScriptIndex,
  type ScreenplayScene,
} from '@neko/screenplay-domain';

export function buildFountainScriptIndex(input: {
  readonly uri: string;
  readonly content: string | Uint8Array;
}): FountainScriptIndex {
  const source = decodeFountainContent(input.content);
  const parsed = parseFountainDocument(source, input.uri, {
    maxSourceCodeUnits: Math.max(1, source.length),
  });
  if (parsed.status === 'failed') {
    throw new Error(
      `Canonical Fountain parsing failed for ${input.uri}: ${parsed.diagnostics[0]?.code ?? 'unknown'}`,
    );
  }
  const scenes = parsed.document.scenes.map((scene) =>
    projectScene(scene, parsed.document.elements),
  );
  return {
    uri: input.uri,
    total_lines: source.length === 0 ? 0 : source.split(/\r?\n/).length,
    scenes,
    characters: parsed.document.characters.map((character): FountainCharacterEntry => ({
      name: character.name,
      first_line: Math.max(0, (character.ranges[0]?.start.line ?? 1) - 1),
      scene_ids: character.sceneIds,
    })),
  };
}

function projectScene(
  scene: ScreenplayScene,
  elements: FountainDocument['elements'],
): FountainSceneEntry {
  const body = elements.filter((element) => scene.elementIds.includes(element.elementId));
  const heading = scene.sceneNumber
    ? `${scene.heading.trimEnd()} #${scene.sceneNumber}#`
    : scene.heading;
  return {
    id: scene.sceneId,
    heading,
    sceneId: scene.sceneId,
    sceneTitle: heading,
    intExt: scene.intExt ?? null,
    timeOfDay: scene.timeOfDay ?? null,
    location: scene.location,
    time: scene.timeOfDay ?? null,
    sceneNumber: scene.sceneNumber ?? null,
    sceneCharacters: scene.characters,
    actionSummary: body
      .filter((element) => element.kind === 'action')
      .map((element) => element.text)
      .join(' ')
      .slice(0, 240),
    estimatedDuration: Math.max(1, body.length * 2),
    directives: [],
    line_start: Math.max(0, scene.range.start.line - 1),
    line_end: Math.max(0, scene.range.end.line - 1),
  };
}

function decodeFountainContent(content: string | Uint8Array): string {
  return typeof content === 'string'
    ? content
    : new TextDecoder('utf-8', { fatal: true }).decode(content);
}
