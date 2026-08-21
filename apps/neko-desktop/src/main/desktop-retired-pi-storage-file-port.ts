import { rm } from 'node:fs/promises';
import path from 'node:path';

import type {
  RetiredPiStorageDirectory,
  RetiredPiStorageFilePort,
} from '@neko/agent-runtime/application';

export class DesktopRetiredPiStorageFilePort implements RetiredPiStorageFilePort {
  readonly #retiredRoot: string;

  constructor(homedir: string) {
    if (!path.isAbsolute(homedir)) {
      throw new Error('Retired Pi storage cleanup requires an absolute home directory.');
    }
    this.#retiredRoot = path.join(homedir, '.neko');
  }

  async remove(directory: RetiredPiStorageDirectory): Promise<void> {
    await rm(path.join(this.#retiredRoot, directory), { force: true, recursive: true });
  }
}
