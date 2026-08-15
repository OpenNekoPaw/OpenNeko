import { isAbsolute } from 'node:path';

import type { WorldPortableWorkspaceRepository } from '@neko/world/application';
import type { WorldAuthoringAuthority } from '@neko/world/contracts';

import { createWorldAuthoringFileRepository } from './world-authoring-file-repository';

export class WorldPortableWorkspaceError extends Error {
  readonly code = 'world-package-workspace-unavailable';

  constructor(message: string) {
    super(message);
    this.name = 'WorldPortableWorkspaceError';
  }
}

export function createWorldPortableWorkspaceRepository(options: {
  readonly workspaceRoot: string;
  readonly authority: WorldAuthoringAuthority;
}): WorldPortableWorkspaceRepository {
  if (!isAbsolute(options.workspaceRoot)) {
    throw new WorldPortableWorkspaceError(
      'World package source must be an absolute Host-authorized Workspace root.',
    );
  }
  const authoring = createWorldAuthoringFileRepository({
    workspaceRoot: options.workspaceRoot,
    scope: options.authority,
  });
  return Object.freeze({
    authority: options.authority,
    readProject: authoring.readProject,
    readPublication: authoring.readPublication,
  });
}
