import * as fs from 'fs/promises';
import * as path from 'path';
import { isProjectSearchCacheManifest, type ProjectSearchCacheManifest } from '@neko/shared';

export async function readProjectSearchCacheManifest(
  filePath: string,
): Promise<ProjectSearchCacheManifest | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    return isProjectSearchCacheManifest(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function writeProjectSearchCacheManifest(
  filePath: string,
  manifest: ProjectSearchCacheManifest,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(manifest, null, 2), 'utf-8');
  await fs.rename(tempPath, filePath);
}

export class DebouncedProjectCacheWriter<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly delayMs: number,
    private readonly write: (value: T) => Promise<void>,
  ) {}

  schedule(value: T): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.write(value);
    }, this.delayMs);
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
