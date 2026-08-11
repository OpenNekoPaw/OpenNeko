import {
  projectLocalTargetKey,
  projectPublicationDependencyKey,
  type ContentProjectComposition,
  type ProjectLocalTargetRef,
} from '../contracts/project-composition';
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
  readonly composition: ContentProjectComposition;
  readonly content: ProjectTargetResolution;
  readonly localTargetResolutions: readonly ProjectTargetResolution[];
  readonly dependencyResolutions: readonly ProjectTargetResolution[];
  readonly discoveredLocalTargets?: readonly ProjectLocalTargetRef[];
  readonly snapshots?: readonly ProjectAuthoringPresentationSnapshotRef[];
}): readonly ProjectAuthoringNavigationItem[] {
  const snapshots = new Map(
    input.snapshots?.map((snapshot) => [snapshot.targetIdentity, snapshot]),
  );
  const contentIdentity = `content-project:${input.composition.contentProjectId}`;
  if (input.content.identity !== contentIdentity) {
    throw new Error(
      `Content target resolution '${input.content.identity}' does not match '${contentIdentity}'.`,
    );
  }
  const content: ProjectAuthoringNavigationItem = {
    kind: 'authoring-target',
    target: {
      kind: 'content-project',
      contentProjectId: input.composition.contentProjectId,
    },
    identity: contentIdentity,
    label: input.content.label ?? input.composition.contentProjectId,
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
  readonly composition: ContentProjectComposition;
  readonly localTargetResolutions: readonly ProjectTargetResolution[];
  readonly dependencyResolutions: readonly ProjectTargetResolution[];
  readonly discoveredLocalTargets?: readonly ProjectLocalTargetRef[];
}): readonly ProjectTargetTreeItem[] {
  const local = new Map(input.localTargetResolutions.map((item) => [item.identity, item]));
  const dependencies = new Map(input.dependencyResolutions.map((item) => [item.identity, item]));
  const items: ProjectTargetTreeItem[] = input.composition.localTargets.map((target) => {
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
    ...input.composition.dependencies.map((dependency): ProjectTargetTreeItem => {
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
  const linked = new Set(input.composition.localTargets.map(projectLocalTargetKey));
  for (const target of input.discoveredLocalTargets ?? []) {
    const identity = projectLocalTargetKey(target);
    if (linked.has(identity)) continue;
    items.push({
      kind: 'unlinked-local-target',
      target,
      identity,
      diagnostic: `Target '${identity}' exists in this Workspace but is not linked to the Project composition.`,
    });
  }
  return items;
}

export function projectPublicationReadiness(
  items: readonly ProjectTargetTreeItem[],
):
  | { readonly ready: true }
  | { readonly ready: false; readonly unavailableIdentities: readonly string[] } {
  const unavailableIdentities = items
    .filter((item) => item.kind === 'external-dependency' && item.diagnostic !== undefined)
    .map((item) => item.identity);
  return unavailableIdentities.length === 0
    ? { ready: true }
    : { ready: false, unavailableIdentities };
}
