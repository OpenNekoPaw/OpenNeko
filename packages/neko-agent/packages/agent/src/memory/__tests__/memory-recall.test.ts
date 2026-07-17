/**
 * MemoryRecall Tests — Project-memory retrieval with relevance scoring
 */

import { describe, it, expect, vi } from 'vitest';
import { MemoryRecall } from '../memory-recall';
import type { IProjectMemoryManager } from '@neko/shared';

function createMockProjectMemory(content: string | null): IProjectMemoryManager {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    getContent: vi.fn().mockReturnValue(content),
    upsertEntry: vi.fn().mockResolvedValue(undefined),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('MemoryRecall', () => {
  describe('empty project memory', () => {
    it('should return empty when no memory layer is configured', async () => {
      const recall = new MemoryRecall({});
      const results = await recall.recall('test query');
      expect(results).toEqual([]);
    });

    it('should return empty when project memory has no content', async () => {
      const recall = new MemoryRecall({
        projectMemory: createMockProjectMemory(null),
      });
      const results = await recall.recall('test query');
      expect(results).toEqual([]);
    });
  });

  describe('project layer', () => {
    it('should recall from project memory H2 sections', async () => {
      const project = createMockProjectMemory(
        '## UI Preferences\nDark theme preferred\n\n## Tech Stack\nReact + TypeScript',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('theme preferred');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.source).toBe('project');
    });

    it('should ignore content outside H2 sections', async () => {
      const project = createMockProjectMemory(
        '# Title\nPreamble text\n\n## Preferences\nUse Chinese explanations',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('Chinese explanations');

      expect(results).toHaveLength(1);
      expect(results[0]!.content).toContain('## Preferences');
      expect(results[0]!.content).not.toContain('# Title');
    });

    it('should filter low-relevance sections', async () => {
      const project = createMockProjectMemory(
        '## Section A\nCompletely unrelated content xyz\n\n## Section B\nMore unrelated abc',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('深色主题编辑器');

      // Both sections should have very low relevance and be filtered
      expect(results).toHaveLength(0);
    });
  });

  describe('project section ranking', () => {
    it('should sort matching sections by relevance', async () => {
      const project = createMockProjectMemory(
        [
          '## React Guide',
          'react components hooks testing patterns',
          '',
          '## React Deploy',
          'react deploy build pipeline',
        ].join('\n'),
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('react components hooks');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((result) => result.source === 'project')).toBe(true);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.relevance).toBeGreaterThanOrEqual(results[i]!.relevance);
      }
    });

    it('should respect limit parameter', async () => {
      const project = createMockProjectMemory(
        '## A\nreact hooks\n\n## B\nreact state\n\n## C\nreact router\n\n## D\nreact testing\n\n## E\nreact build\n\n## F\nreact deploy',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('react', 3);

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should collapse duplicate recalled project sections before applying the result limit', async () => {
      const repeatedRequest =
        '分析前10页，生成分镜表 @${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub';
      const repeatedReference = [
        repeatedRequest,
        '',
        '--- 引用文档 ---',
        '',
        '[文档: ${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub]',
        '分析该文档前，先调用 ReadDocument。',
      ].join('\n');
      const project = createMockProjectMemory(
        ['## 近期决策', repeatedReference, '', '## Recent Decisions', repeatedReference, ''].join(
          '\n',
        ),
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('分析前10页', 5);

      expect(results).toHaveLength(1);
      expect(
        results.filter((result) => result.content.includes('BLAME！(新裝版)]卷01.epub')),
      ).toHaveLength(1);
    });

    it('should collapse duplicate list entries inside a recalled project section', async () => {
      const repeatedEntry = [
        '- 分析前10页，生成分镜表 @${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub',
        '',
        '--- 引用文档 ---',
        '',
        '[文档: ${A}/epub/animation/Blame/[Kmoe][BLAME！(新裝版)]卷01.epub]',
        '分析该文档前，先调用 ReadDocument。',
      ].join('\n');
      const project = createMockProjectMemory(
        ['## 近期决策', repeatedEntry, repeatedEntry, repeatedEntry].join('\n'),
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('分析前10页', 5);

      expect(results).toHaveLength(1);
      const content = results[0]!.content;
      expect(content.match(/分析前10页，生成分镜表/g)).toHaveLength(1);
      expect(content.match(/--- 引用文档 ---/g)).toHaveLength(1);
    });
  });

  describe('relevance scoring', () => {
    it('should rank higher relevance for more keyword matches', async () => {
      const project = createMockProjectMemory(
        '## High Match\nreact hooks component testing\n\n## Low Match\nunrelated content here',
      );

      const recall = new MemoryRecall({ projectMemory: project });
      const results = await recall.recall('react hooks component');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.content).toContain('react hooks');
    });
  });
});
