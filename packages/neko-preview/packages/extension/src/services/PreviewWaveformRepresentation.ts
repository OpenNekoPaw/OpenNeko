import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  normalizeWorkspaceContentPath,
  type ContentRepresentationGenerator,
  type ContentRepresentationService,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import type { PreviewService } from './PreviewService';

const encoder = new TextEncoder();

export class PreviewWaveformGenerator implements ContentRepresentationGenerator {
  readonly id = 'neko-preview-waveform';
  readonly revision = '1';
  readonly kinds = ['waveform'] as const;

  constructor(
    private readonly workspaceRoot: string,
    private readonly previewService: PreviewService,
  ) {}

  async generate(
    input: Parameters<ContentRepresentationGenerator['generate']>[0],
  ): Promise<Awaited<ReturnType<ContentRepresentationGenerator['generate']>>> {
    if (input.spec.kind !== 'waveform' || input.source.kind !== 'workspace-file') {
      throw new Error('Preview waveform generator requires a workspace-file waveform request.');
    }
    const sourcePath = resolveWorkspaceFile(this.workspaceRoot, input.source.path);
    const waveform = await this.previewService.getWaveform(sourcePath);
    const bytes = encoder.encode(JSON.stringify(waveform));
    return {
      bytes,
      metadata: {
        mimeType: 'application/json',
        byteLength: bytes.byteLength,
        durationSeconds: waveform.duration,
      },
    };
  }
}

export class PreviewWaveformRepresentationReader {
  constructor(
    private readonly workspaceRoot: string,
    private readonly representations: ContentRepresentationService,
  ) {}

  async getWaveform(
    filePath: string,
  ): Promise<{ peaks: number[]; duration: number; sampleRate: number }> {
    const source = await createWorkspaceFileLocator(this.workspaceRoot, filePath);
    const represented = await this.representations.getRepresentation({
      source,
      spec: { kind: 'waveform' },
    });
    if (represented.status !== 'ready') throw new Error(represented.diagnostic.message);
    const loaded = await this.representations.readRepresentation(represented.locator, {
      maxBytes: 64 * 1024 * 1024,
    });
    if (loaded.status !== 'ready') throw new Error(loaded.diagnostic.message);
    const value: unknown = JSON.parse(new TextDecoder().decode(loaded.bytes));
    if (!isWaveform(value)) throw new Error('Preview waveform representation is invalid.');
    return value;
  }
}

async function createWorkspaceFileLocator(
  workspaceRoot: string,
  filePath: string,
): Promise<WorkspaceFileContentLocator> {
  const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/gu, '/');
  const normalizedPath = normalizeWorkspaceContentPath(relativePath);
  if (!normalizedPath || normalizedPath !== relativePath) {
    throw new Error('Preview waveform source must be a canonical workspace file.');
  }
  const stat = await fs.stat(filePath);
  return {
    kind: 'workspace-file',
    path: normalizedPath,
    fingerprint: { strategy: 'mtime-size', value: `${stat.mtimeMs}:${stat.size}` },
  };
}

function resolveWorkspaceFile(workspaceRoot: string, relativePath: string): string {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(workspaceRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Preview waveform source escapes the workspace.');
  }
  return resolved;
}

function isWaveform(
  value: unknown,
): value is { peaks: number[]; duration: number; sampleRate: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const waveform = value as Record<string, unknown>;
  return (
    Array.isArray(waveform['peaks']) &&
    waveform['peaks'].every((peak) => typeof peak === 'number') &&
    typeof waveform['duration'] === 'number' &&
    typeof waveform['sampleRate'] === 'number'
  );
}
