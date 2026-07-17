/**
 * Input Processor Tests
 */

import { describe, it, expect } from 'vitest';
import { createInputProcessor } from '../input-processor';
import type { IFileReader } from '../types';

// Mock file reader
function createMockFileReader(files: Record<string, string>): IFileReader {
  return {
    async readFile(path: string): Promise<string> {
      if (path in files) {
        return files[path];
      }
      throw new Error(`File not found: ${path}`);
    },
    async exists(path: string): Promise<boolean> {
      return path in files;
    },
    async isFile(path: string): Promise<boolean> {
      return path in files && !path.endsWith('/');
    },
    async isDirectory(path: string): Promise<boolean> {
      return path.endsWith('/') || Object.keys(files).some((f) => f.startsWith(path + '/'));
    },
    async glob(_pattern: string, options?: { cwd?: string }): Promise<string[]> {
      const cwd = options?.cwd ?? '';
      const prefix = cwd ? cwd + '/' : '';
      return Object.keys(files)
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length));
    },
    async stat(path: string): Promise<{ size: number; isFile: boolean; isDirectory: boolean }> {
      if (path in files) {
        return {
          size: files[path].length,
          isFile: true,
          isDirectory: false,
        };
      }
      throw new Error(`File not found: ${path}`);
    },
  };
}

describe('InputProcessor', () => {
  describe('parseReferences', () => {
    it('should parse simple file reference', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('Check @src/index.ts for issues');

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        original: '@src/index.ts',
        path: 'src/index.ts',
        type: 'file',
      });
    });

    it('should parse multiple file references', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('Compare @src/a.ts and @src/b.ts');

      expect(refs).toHaveLength(2);
      expect(refs[0].path).toBe('src/a.ts');
      expect(refs[1].path).toBe('src/b.ts');
    });

    it('should parse quoted file references with spaces', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('Check @"assets/ref file.zip" and @src/b.ts');

      expect(refs).toHaveLength(2);
      expect(refs[0]).toEqual({
        original: '@"assets/ref file.zip"',
        path: 'assets/ref file.zip',
        type: 'file',
      });
      expect(refs[1].path).toBe('src/b.ts');
    });

    it('should parse line range reference', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('Look at @src/index.ts:10-20');

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        original: '@src/index.ts:10-20',
        path: 'src/index.ts',
        type: 'file',
        lineRange: { start: 10, end: 20 },
      });
    });

    it('should parse single line reference with context', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('Error at @src/index.ts:15');

      expect(refs).toHaveLength(1);
      expect(refs[0].lineRange).toEqual({ start: 10, end: 20 });
    });

    it('should parse directory reference', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('Check @src/ directory');

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        original: '@src/',
        path: 'src',
        type: 'directory',
      });
    });

    it('should parse glob pattern', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('Check @src/*.ts files');

      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        original: '@src/*.ts',
        path: 'src/*.ts',
        type: 'glob',
      });
    });

    it('should handle no references', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences('No file references here');

      expect(refs).toHaveLength(0);
    });

    it('should leave durable asset and media-library references out of file loading', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const refs = processor.parseReferences(
        'Use @asset:hero and @${MEDIA}/shots/take.mov with @src/index.ts',
      );

      expect(refs).toEqual([
        {
          original: '@src/index.ts',
          path: 'src/index.ts',
          type: 'file',
        },
      ]);
    });
  });

  describe('process', () => {
    it('should process file reference and read content', async () => {
      const mockReader = createMockFileReader({
        'src/index.ts': 'const x = 1;\nconst y = 2;',
      });

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
        includeLineNumbers: false,
      });

      const result = await processor.process('Check @src/index.ts');

      expect(result.hasFiles).toBe(true);
      expect(result.fileReferences).toHaveLength(1);
      expect(result.fileReferences[0].content).toBe('const x = 1;\nconst y = 2;');
      expect(result.errors).toHaveLength(0);
    });

    it('should add line numbers when enabled', async () => {
      const mockReader = createMockFileReader({
        'src/index.ts': 'line1\nline2\nline3',
      });

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
        includeLineNumbers: true,
      });

      const result = await processor.process('Check @src/index.ts');

      expect(result.fileReferences[0].content).toContain('1 | line1');
      expect(result.fileReferences[0].content).toContain('2 | line2');
      expect(result.fileReferences[0].content).toContain('3 | line3');
    });

    it('should handle file not found', async () => {
      const mockReader = createMockFileReader({});

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
      });

      const result = await processor.process('Check @nonexistent.ts');

      expect(result.hasFiles).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].reference).toBe('@nonexistent.ts');
    });

    it('should respect max files limit', async () => {
      const files: Record<string, string> = {};
      for (let i = 0; i < 30; i++) {
        files[`file${i}.ts`] = `content ${i}`;
      }
      const mockReader = createMockFileReader(files);

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
        maxFiles: 5,
      });

      // Create input with many references
      const input = Array.from({ length: 10 }, (_, i) => `@file${i}.ts`).join(' ');
      const result = await processor.process(input);

      // Should only process 5 files
      const loadedFiles = result.fileReferences.filter((r) => r.content);
      expect(loadedFiles.length).toBeLessThanOrEqual(5);
    });

    it('should exclude files in excluded directories', async () => {
      const mockReader = createMockFileReader({
        'node_modules/pkg/index.js': 'module code',
        'src/index.ts': 'source code',
      });

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
        excludePatterns: ['node_modules'],
        includeLineNumbers: false,
      });

      const result = await processor.process('Check @node_modules/pkg/index.js and @src/index.ts');

      expect(result.errors.some((e) => e.reference === '@node_modules/pkg/index.js')).toBe(true);
      expect(result.fileReferences.find((r) => r.path === 'src/index.ts')?.content).toBe(
        'source code',
      );
    });

    it('should exclude workspace runtime and cache directories by default', async () => {
      const mockReader = createMockFileReader({
        '.neko/logs/events.jsonl': 'runtime log',
        '.neko/memory.md': 'memory',
        '.cache/generated.json': 'cache payload',
        'src/cacheable.ts': 'source code',
      });

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
        includeLineNumbers: false,
      });

      const result = await processor.process(
        'Check @.neko/logs/events.jsonl @.neko/memory.md @.cache/generated.json @src/cacheable.ts',
      );

      expect(result.errors.map((error) => error.reference)).toEqual([
        '@.neko/logs/events.jsonl',
        '@.neko/memory.md',
        '@.cache/generated.json',
      ]);
      expect(result.fileReferences.find((r) => r.path === 'src/cacheable.ts')?.content).toBe(
        'source code',
      );
    });

    it('should match excluded directories by path segment', async () => {
      const mockReader = createMockFileReader({
        'src/building.ts': 'source code',
      });

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
        includeLineNumbers: false,
      });

      const result = await processor.process('Check @src/building.ts');

      expect(result.errors).toHaveLength(0);
      expect(result.fileReferences[0]?.content).toBe('source code');
    });

    it('should handle line range', async () => {
      const mockReader = createMockFileReader({
        'src/index.ts': 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10',
      });

      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        fileReader: mockReader,
        includeLineNumbers: false,
      });

      const result = await processor.process('Check @src/index.ts:3-5');

      expect(result.fileReferences[0].content).toBe('line3\nline4\nline5');
    });
  });

  describe('formatFileContent', () => {
    it('should format file content with language hint', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
        includeLanguageHints: true,
      });

      const formatted = processor.formatFileContent({
        original: '@src/index.ts',
        path: 'src/index.ts',
        type: 'file',
        content: 'const x = 1;',
      });

      expect(formatted).toContain('### File: src/index.ts');
      expect(formatted).toContain('```typescript');
      expect(formatted).toContain('const x = 1;');
    });

    it('should include line range in header', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const formatted = processor.formatFileContent({
        original: '@src/index.ts:10-20',
        path: 'src/index.ts',
        type: 'file',
        content: 'code here',
        lineRange: { start: 10, end: 20 },
      });

      expect(formatted).toContain('(lines 10-20)');
    });

    it('should handle file without content', () => {
      const processor = createInputProcessor({
        workspaceRoot: '/workspace',
      });

      const formatted = processor.formatFileContent({
        original: '@src/index.ts',
        path: 'src/index.ts',
        type: 'file',
      });

      expect(formatted).toContain('(not loaded)');
    });
  });
});
