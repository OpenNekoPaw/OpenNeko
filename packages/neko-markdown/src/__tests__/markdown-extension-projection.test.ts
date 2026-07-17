import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeMarkdownResourceLookupToken,
  projectNekoMarkdownGenerationPromptParts,
  projectNekoMarkdownExtensions,
  stripMarkdownPlacementHint,
} from '../index';

describe('@neko/markdown extension projection', () => {
  it('projects CommonMark image targets without treating placement hints as identity', () => {
    expect(normalizeMarkdownResourceLookupToken('`Page 1`')).toBe('page_1');
    expect(stripMarkdownPlacementHint('P1#panel_2')).toEqual({
      lookupToken: 'P1',
      placementHint: 'panel_2',
    });

    const projection = projectNekoMarkdownExtensions('![panel](P1#panel_2)');

    expect(projection.images).toEqual([
      expect.objectContaining({
        altText: 'panel',
        rawTarget: 'P1#panel_2',
        lookupToken: 'P1',
        placementHint: 'panel_2',
      }),
    ]);
    expect(projection.source).toBe('![panel](P1#panel_2)');
  });

  it('preserves unsupported Neko resource-reference syntax with diagnostics', () => {
    const projection = projectNekoMarkdownExtensions('![[cover.png]] and [[script.md#Scene 2]]');

    expect(projection.resourceReferences).toEqual([
      expect.objectContaining({
        embed: true,
        target: 'cover.png',
        lookupToken: 'cover.png',
      }),
      expect.objectContaining({
        embed: false,
        target: 'script.md#Scene 2',
        lookupToken: 'script.md',
        placementHint: 'Scene 2',
      }),
    ]);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'MD_RESOURCE_REFERENCE_UNSUPPORTED',
        phase: 'resolve',
        parameters: { token: 'cover.png' },
      }),
      expect.objectContaining({
        severity: 'warning',
        code: 'MD_RESOURCE_REFERENCE_UNSUPPORTED',
        phase: 'resolve',
        parameters: { token: 'script.md#Scene 2' },
      }),
    ]);
    expect(projection.source).toBe('![[cover.png]] and [[script.md#Scene 2]]');
  });

  it('resolves enabled Neko resource references through caller-provided resolvers', () => {
    const projection = projectNekoMarkdownExtensions('Use ![[cover.png#panel_1]] as reference.', {
      resourceReferences: 'enabled',
      requireResolvedReferences: true,
      resourceResolver: {
        resolveResource: (resource) =>
          resource.lookupToken === 'cover.png'
            ? { status: 'resolved', ref: { kind: 'asset', id: 'asset-cover' } }
            : { status: 'unresolved' },
      },
    });

    expect(projection.resourceReferences).toEqual([
      expect.objectContaining({
        embed: true,
        raw: '![[cover.png#panel_1]]',
        lookupToken: 'cover.png',
        placementHint: 'panel_1',
        status: 'resolved',
        ref: { kind: 'asset', id: 'asset-cover' },
      }),
    ]);
    expect(projection.handoffRefs).toEqual([
      {
        source: 'markdown',
        ref: { kind: 'asset', id: 'asset-cover' },
        token: '![[cover.png#panel_1]]',
        placementHint: 'panel_1',
      },
    ]);
    expect(projection.diagnostics).toEqual([]);
  });

  it('tokenizes mentions without resolving ambiguous labels by display order', () => {
    const projection = projectNekoMarkdownExtensions('Use @Aki in shot 3.', {
      requireResolvedReferences: true,
      mentionResolver: {
        resolveMention: () => ({
          status: 'ambiguous',
          candidates: [
            { kind: 'character', id: 'character-aki-1' },
            { kind: 'character', id: 'character-aki-2' },
          ],
        }),
      },
    });

    expect(projection.mentions).toEqual([
      expect.objectContaining({
        raw: '@Aki',
        label: 'Aki',
        status: 'ambiguous',
      }),
    ]);
    expect(projection.mentions[0]).not.toHaveProperty('ref');
    expect(projection.handoffRefs).toEqual([]);
    expect(projection.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'MD_MENTION_AMBIGUOUS',
        phase: 'resolve',
        parameters: { token: '@Aki' },
      }),
    ]);
  });

  it('keeps sentence punctuation outside mention tokens', () => {
    const projection = projectNekoMarkdownExtensions('Use @Aki. Then compare @script.md.', {
      requireResolvedReferences: true,
    });

    expect(projection.mentions).toEqual([
      expect.objectContaining({
        raw: '@Aki',
        label: 'Aki',
      }),
      expect.objectContaining({
        raw: '@script.md',
        label: 'script.md',
      }),
    ]);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.parameters.token)).toEqual([
      '@Aki',
      '@script.md',
    ]);
  });

  it('preserves creative table source and unknown columns', () => {
    const markdown = [
      '| shot | scene | voice | unexpected field |',
      '| --- | --- | --- | --- |',
      '| S1 | Alley | whisper | keep me |',
    ].join('\n');
    const projection = projectNekoMarkdownExtensions(markdown, {
      creativeTableKnownColumns: ['shot', 'scene'],
    });

    expect(projection.source).toBe(markdown);
    expect(projection.creativeTables).toEqual([
      expect.objectContaining({
        headers: ['shot', 'scene', 'voice', 'unexpected field'],
        rows: [['S1', 'Alley', 'whisper', 'keep me']],
        unknownColumns: ['voice', 'unexpected field'],
      }),
    ]);
  });

  it('projects generation prompt chunks independently from skills and renderers', () => {
    const parts = projectNekoMarkdownGenerationPromptParts(
      '场景视频生成：以 P1#panel_1 作为首帧参考，镜头缓慢推近，无对白，保持原分格构图一致',
    );

    expect(parts).toEqual([
      { kind: 'intent', text: '场景视频生成' },
      { kind: 'reference', text: '以 P1#panel_1 作为首帧参考' },
      { kind: 'camera', text: '镜头缓慢推近' },
      { kind: 'dialogue', text: '无对白' },
      { kind: 'constraint', text: '保持原分格构图一致' },
    ]);
  });

  it('keeps core exports independent from host, UI, Agent, and Canvas packages', () => {
    const sourceDir = fileURLToPath(new URL('..', import.meta.url));
    const sourceFiles = collectSourceFiles(sourceDir);
    const forbiddenImportPattern =
      /from ['"](?:@neko-agent|@neko-canvas|@neko\/ui|react|react-dom|vscode|node:|@neko\/content|@neko\/shared)/;

    expect(sourceFiles).toContain(join(sourceDir, 'index.ts'));
    for (const file of sourceFiles.filter((path) => !path.includes('/__tests__/'))) {
      expect(readFileSync(file, 'utf8')).not.toMatch(forbiddenImportPattern);
    }
  });
});

function collectSourceFiles(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collectSourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}
