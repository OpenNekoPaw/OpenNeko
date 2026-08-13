import {
  parseProjectPublicationDependencyRef,
  projectPublicationDependencyKey,
  type ProjectPublicationDependencyRef,
} from './project-target';

export const PROJECT_REFERENCE_OWNER_KINDS = [
  'canvas',
  'cut',
  'entity-representation',
  'character',
  'world',
] as const;

export type ProjectReferenceOwnerKind = (typeof PROJECT_REFERENCE_OWNER_KINDS)[number];

export interface ProjectReferenceOwnerSnapshot {
  readonly ownerKind: ProjectReferenceOwnerKind;
  readonly ownerId: string;
  readonly sourceFingerprint: string;
  readonly references: readonly ProjectPublicationDependencyRef[];
}

export interface ProjectReferenceCoverage {
  readonly expectedOwnerKinds: readonly ProjectReferenceOwnerKind[];
  readonly coveredOwnerKinds: readonly ProjectReferenceOwnerKind[];
}

export interface ProjectReferenceDiagnostic {
  readonly ownerKind: ProjectReferenceOwnerKind;
  readonly ownerId: string;
  readonly message: string;
}

export interface ProjectDependencyOccurrence {
  readonly ownerKind: ProjectReferenceOwnerKind;
  readonly ownerId: string;
  readonly ownerFingerprint: string;
}

export interface ProjectDependencyItem {
  readonly dependency: ProjectPublicationDependencyRef;
  readonly occurrences: readonly ProjectDependencyOccurrence[];
}

export interface ProjectDependencySnapshot {
  readonly projectId: string;
  readonly coverage: 'complete' | 'incomplete';
  readonly missingOwnerKinds: readonly ProjectReferenceOwnerKind[];
  readonly dependencies: readonly ProjectDependencyItem[];
  readonly diagnostics: readonly ProjectReferenceDiagnostic[];
}

export function projectDependencySnapshot(input: {
  readonly projectId: string;
  readonly owners: readonly ProjectReferenceOwnerSnapshot[];
  readonly coverage: ProjectReferenceCoverage;
  readonly diagnostics?: readonly ProjectReferenceDiagnostic[];
}): ProjectDependencySnapshot {
  const projectId = requireIdentity(input.projectId, 'Project');
  requireExactCoverage(input.coverage);
  const owners = input.owners.map(parseOwnerSnapshot);
  const ownerKeys = owners.map((owner) => `${owner.ownerKind}:${owner.ownerId}`);
  if (new Set(ownerKeys).size !== ownerKeys.length) {
    throw new Error('Project reference owner snapshots must be unique.');
  }
  const byDependency = new Map<string, ProjectDependencyItem>();
  for (const owner of owners) {
    for (const reference of owner.references) {
      const key = projectPublicationDependencyKey(reference);
      const occurrence = {
        ownerKind: owner.ownerKind,
        ownerId: owner.ownerId,
        ownerFingerprint: owner.sourceFingerprint,
      };
      const current = byDependency.get(key);
      if (current) {
        byDependency.set(key, {
          ...current,
          occurrences: [...current.occurrences, occurrence],
        });
      } else {
        byDependency.set(key, { dependency: reference, occurrences: [occurrence] });
      }
    }
  }
  const missingOwnerKinds = PROJECT_REFERENCE_OWNER_KINDS.filter(
    (kind) => !input.coverage.coveredOwnerKinds.includes(kind),
  );
  return {
    projectId,
    coverage: missingOwnerKinds.length === 0 ? 'complete' : 'incomplete',
    missingOwnerKinds,
    dependencies: [...byDependency.entries()]
      .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
      .map(([, item]) => item),
    diagnostics: [...(input.diagnostics ?? [])],
  };
}

function parseOwnerSnapshot(owner: ProjectReferenceOwnerSnapshot): ProjectReferenceOwnerSnapshot {
  if (!PROJECT_REFERENCE_OWNER_KINDS.includes(owner.ownerKind)) {
    throw new Error(`Unknown Project reference owner '${String(owner.ownerKind)}'.`);
  }
  return {
    ownerKind: owner.ownerKind,
    ownerId: requireIdentity(owner.ownerId, 'Project reference owner'),
    sourceFingerprint: requireIdentity(owner.sourceFingerprint, 'Project reference fingerprint'),
    references: owner.references.map(parseProjectPublicationDependencyRef),
  };
}

function requireExactCoverage(coverage: ProjectReferenceCoverage): void {
  const expected = [...coverage.expectedOwnerKinds].sort();
  const canonical = [...PROJECT_REFERENCE_OWNER_KINDS].sort();
  if (
    expected.length !== canonical.length ||
    expected.some((kind, index) => kind !== canonical[index])
  ) {
    throw new Error('Project reference coverage must declare the fixed owner set.');
  }
  if (
    new Set(coverage.coveredOwnerKinds).size !== coverage.coveredOwnerKinds.length ||
    coverage.coveredOwnerKinds.some((kind) => !PROJECT_REFERENCE_OWNER_KINDS.includes(kind))
  ) {
    throw new Error('Project reference coverage contains an invalid owner kind.');
  }
}

function requireIdentity(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} identity must be non-empty.`);
  return value;
}
