import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { EngineClient } from '@neko/neko-client';
import {
  normalizeWorkspaceContentPath,
  type ContentRepresentationGenerator,
  type WorkspaceFileContentLocator,
} from '@neko/shared';

const encoder = new TextEncoder();

export class CutMediaRepresentationGenerator implements ContentRepresentationGenerator {
  readonly id = 'neko-cut-media';
  readonly revision = '1';
  readonly kinds = ['proxy', 'waveform', 'loudness'] as const;

  constructor(
    private readonly workspaceRoot: string,
    private readonly client: EngineClient,
  ) {}

  async generate(
    input: Parameters<ContentRepresentationGenerator['generate']>[0],
  ): Promise<Awaited<ReturnType<ContentRepresentationGenerator['generate']>>> {
    if (input.source.kind !== 'workspace-file') {
      throw new Error('Cut media representations require a workspace-file source.');
    }
    const sourcePath = resolveWorkspaceFile(this.workspaceRoot, input.source.path);
    switch (input.spec.kind) {
      case 'waveform':
        return jsonRepresentation(await this.client.waveform(sourcePath));
      case 'loudness':
        return jsonRepresentation(
          await this.client.analyzeLoudness(sourcePath, input.spec.targetLufs ?? -14),
        );
      case 'proxy':
        return this.generateProxy(sourcePath, input.spec.profile, input.signal);
      default:
        throw new Error(`Cut media generator does not support ${input.spec.kind}.`);
    }
  }

  private async generateProxy(
    sourcePath: string,
    profile: string,
    signal?: AbortSignal,
  ): Promise<Awaited<ReturnType<ContentRepresentationGenerator['generate']>>> {
    if (signal?.aborted) throw signal.reason ?? new Error('Proxy generation was cancelled.');
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-cut-proxy-'));
    const outputPath = path.join(tempRoot, 'proxy.mp4');
    try {
      const result = await this.client.dispatch({
        group: 'videos',
        action: 'proxy',
        options: { source: sourcePath, output: outputPath, profile },
      });
      if (result.status !== 'ok') {
        throw new Error(result.error?.message ?? 'Engine proxy generation failed.');
      }
      const bytes = await fs.readFile(outputPath);
      return {
        bytes,
        metadata: { mimeType: 'video/mp4', byteLength: bytes.byteLength },
      };
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

export async function createCutRepresentationSource(
  workspaceRoot: string,
  absolutePath: string,
): Promise<WorkspaceFileContentLocator> {
  const relativePath = path.relative(workspaceRoot, absolutePath).replace(/\\/gu, '/');
  const normalizedPath = normalizeWorkspaceContentPath(relativePath);
  if (!normalizedPath || normalizedPath !== relativePath) {
    throw new Error('Cut representation source must be a canonical workspace file.');
  }
  const stat = await fs.stat(absolutePath);
  return {
    kind: 'workspace-file',
    path: normalizedPath,
    fingerprint: { strategy: 'mtime-size', value: `${stat.mtimeMs}:${stat.size}` },
  };
}

function jsonRepresentation(value: unknown) {
  const bytes = encoder.encode(JSON.stringify(value));
  return {
    bytes,
    metadata: { mimeType: 'application/json', byteLength: bytes.byteLength },
  };
}

function resolveWorkspaceFile(workspaceRoot: string, relativePath: string): string {
  const resolved = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(workspaceRoot, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Cut representation source escapes the workspace.');
  }
  return resolved;
}
