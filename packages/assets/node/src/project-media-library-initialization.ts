import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import {
  workspaceLinkedMediaLibraryPath,
  type ProjectMediaLibraryDiagnostic,
} from '@neko/assets-domain/contracts';
import { ProjectMediaLibraryBindingRepository } from './project-media-library-binding-repository';
import {
  listGlobalMediaLibraryConnections,
  resolveGlobalMediaLibraryTarget,
} from './global-media-library-files';
import { listWorkspaceLinkedMediaLibraries } from './workspace-linked-media-libraries';
import { readProjectContentReferences } from './project-content-reference-readers';

export interface ProjectMediaLibraryInitializationResult {
  readonly adoptedLibraryNames: readonly string[];
  readonly diagnostics: readonly ProjectMediaLibraryDiagnostic[];
}

/** Rebuilds only absent, non-authoritative local bindings from exact existing authorities. */
export async function initializeProjectMediaLibraryBindings(input: {
  readonly projectId: string;
  readonly workspaceRoot: string;
  readonly globalMediaLibraryRoot: string;
}): Promise<ProjectMediaLibraryInitializationResult> {
  const [references, links, connections] = await Promise.all([
    readProjectContentReferences({
      workspacePath: input.workspaceRoot,
      projectId: input.projectId,
    }),
    listWorkspaceLinkedMediaLibraries(input.workspaceRoot),
    listGlobalMediaLibraryConnections(input.globalMediaLibraryRoot),
  ]);
  const requiredNames = new Set(
    references.requirements.requirements.map((requirement) => requirement.libraryName),
  );
  const availableConnections = connections.filter(
    (connection) => connection.availability === 'available',
  );
  const connectionsByTarget = new Map<string, string[]>();
  for (const connection of availableConnections) {
    try {
      const target = await realpath(
        await resolveGlobalMediaLibraryTarget({
          mediaLibraryRoot: input.globalMediaLibraryRoot,
          libraryId: connection.libraryId,
        }),
      );
      connectionsByTarget.set(target, [
        ...(connectionsByTarget.get(target) ?? []),
        connection.libraryId,
      ]);
    } catch {
      // The global catalog already owns the unavailable-connection diagnostic.
    }
  }

  const bindings = new ProjectMediaLibraryBindingRepository(input.workspaceRoot, input.projectId);
  const adoptedLibraryNames: string[] = [];
  const diagnostics: ProjectMediaLibraryDiagnostic[] = [];
  for (const link of links) {
    if (!requiredNames.has(link.name) || link.availability !== 'available') continue;
    const current = await bindings.read(link.name);
    if (current.status !== 'absent') continue;
    const linkPath = path.join(
      input.workspaceRoot,
      ...workspaceLinkedMediaLibraryPath(link.name).split('/'),
    );
    const matches = connectionsByTarget.get(await realpath(linkPath)) ?? [];
    if (matches.length !== 1) {
      diagnostics.push({
        code: 'entry-conflict',
        projectId: input.projectId,
        libraryName: link.name,
        message:
          matches.length === 0
            ? 'The existing Workspace link does not match an available global Media Library.'
            : 'The existing Workspace link matches more than one global Media Library connection.',
      });
      continue;
    }
    const connectionId = matches[0];
    if (!connectionId) continue;
    await bindings.apply({
      libraryName: link.name,
      connectionId,
      expectedBindingFingerprint: null,
    });
    adoptedLibraryNames.push(link.name);
  }
  return {
    adoptedLibraryNames: adoptedLibraryNames.sort((left, right) => left.localeCompare(right)),
    diagnostics,
  };
}
