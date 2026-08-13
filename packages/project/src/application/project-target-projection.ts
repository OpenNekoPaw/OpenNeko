import {
  projectLocalTargetKey,
  projectPublicationDependencyKey,
  type ProjectLocalTargetRef,
  type ProjectPublicationDependencyRef,
} from '../contracts/project-target';
import type { ProjectDependencySnapshot } from '../contracts/project-dependency';
import type {
  ProjectAuthoringNavigationItem,
  ProjectAuthoringPresentationSnapshotRef,
  ProjectSourceStudioTarget,
  ProjectTargetTreeItem,
} from '../contracts/project-authoring-navigation';

export interface ProjectTargetResolution {
  readonly identity: string;
  readonly label?: string;
  readonly diagnostic?: string;
  readonly sourceStudioTarget?: ProjectSourceStudioTarget;
}

export type {
  ProjectAuthoringNavigationItem,
  ProjectAuthoringPresentationSnapshotRef,
  ProjectSourceStudioTarget,
  ProjectTargetTreeItem,
} from '../contracts/project-authoring-navigation';

export function projectAuthoringNavigation(input: {
  readonly projectId: string;
  readonly localTargets: readonly ProjectLocalTargetRef[];
  readonly dependencies: readonly ProjectPublicationDependencyRef[];
  readonly content: ProjectTargetResolution;
  readonly localTargetResolutions: readonly ProjectTargetResolution[];
  readonly dependencyResolutions: readonly ProjectTargetResolution[];
  readonly snapshots?: readonly ProjectAuthoringPresentationSnapshotRef[];
}): readonly ProjectAuthoringNavigationItem[] {
  const snapshots = new Map(
    input.snapshots?.map((snapshot) => [snapshot.targetIdentity, snapshot]),
  );
  const contentIdentity = `content-project:${input.projectId}`;
  if (input.content.identity !== contentIdentity) {
    throw new Error(
      `Content target resolution '${input.content.identity}' does not match '${contentIdentity}'.`,
    );
  }
  const content: ProjectAuthoringNavigationItem = {
    kind: 'authoring-target',
    target: {
      kind: 'content-project',
      contentProjectId: input.projectId,
    },
    identity: contentIdentity,
    label: input.content.label ?? input.projectId,
    diagnostic: input.content.diagnostic,
    snapshot: snapshots.get(contentIdentity),
  };
  const tree = projectTargetTree(input);
  return [
    content,
    ...tree.map((item): ProjectAuthoringNavigationItem => {
      if (item.kind !== 'local-target') return item;
      return {
        kind: 'authoring-target',
        target: item.target,
        identity: item.identity,
        label: item.label ?? item.identity,
        diagnostic: item.diagnostic,
        snapshot: snapshots.get(item.identity),
      };
    }),
  ];
}

export function projectTargetTree(input: {
  readonly localTargets: readonly ProjectLocalTargetRef[];
  readonly dependencies: readonly ProjectPublicationDependencyRef[];
  readonly localTargetResolutions: readonly ProjectTargetResolution[];
  readonly dependencyResolutions: readonly ProjectTargetResolution[];
}): readonly ProjectTargetTreeItem[] {
  const local = new Map(input.localTargetResolutions.map((item) => [item.identity, item]));
  const dependencies = new Map(input.dependencyResolutions.map((item) => [item.identity, item]));
  const items: ProjectTargetTreeItem[] = input.localTargets.map((target) => {
    const identity = projectLocalTargetKey(target);
    const resolved = local.get(identity);
    return {
      kind: 'local-target',
      target,
      identity,
      label: resolved?.label,
      diagnostic:
        resolved?.diagnostic ?? (resolved ? undefined : `Target '${identity}' is unavailable.`),
    };
  });
  items.push(
    ...input.dependencies.map((dependency): ProjectTargetTreeItem => {
      const identity = projectPublicationDependencyKey(dependency);
      const resolved = dependencies.get(identity);
      return {
        kind: 'external-dependency',
        dependency,
        identity,
        label: resolved?.label,
        diagnostic:
          resolved?.diagnostic ??
          (resolved ? undefined : `Publication dependency '${identity}' is unavailable.`),
        readOnly: true,
        sourceStudioTarget: resolved?.sourceStudioTarget,
      };
    }),
  );
  return items;
}

export function projectPublicationReadiness(input: {
  readonly items: readonly ProjectTargetTreeItem[];
  readonly dependencies: ProjectDependencySnapshot;
}):
  | { readonly ready: true }
  | {
      readonly ready: false;
      readonly unavailableIdentities: readonly string[];
      readonly incompleteOwnerKinds: ProjectDependencySnapshot['missingOwnerKinds'];
    } {
  const unavailableIdentities = input.items
    .filter((item) => item.kind === 'external-dependency' && item.diagnostic !== undefined)
    .map((item) => item.identity);
  return unavailableIdentities.length === 0 && input.dependencies.coverage === 'complete'
    ? { ready: true }
    : {
        ready: false,
        unavailableIdentities,
        incompleteOwnerKinds: input.dependencies.missingOwnerKinds,
      };
}
