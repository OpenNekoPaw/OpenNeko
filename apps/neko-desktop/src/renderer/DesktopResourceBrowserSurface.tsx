import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from '@neko/ui/i18n/react';
import type {
  DesktopProjectCatalogItem,
  DesktopProjectTabProjection,
  DesktopShellProjection,
} from '@neko/host/desktop-shell-contract';
import { createDesktopResourceBrowserIdentity } from '../shared/resource-browser-bridge-contract';
import { createElectronResourceBrowserHostRuntime } from './desktop-resource-browser-host-runtime';
import { useDesktopApplicationSettings } from './application-settings-context';
import type { ResourceBrowserItem } from '@neko/assets-domain/resource-browser/contract';
import type {
  ResourceBrowserCharacterCreation,
  ResourceBrowserCharacterCreationOutcome,
} from '@neko/assets-webview/resource-browser/root';
import {
  createEmptyCharacterDefinition,
  type CharacterCreationSourceSelection,
} from '@neko/chara/contracts';
import type {
  OpenNekoDesktopProjectLocalAuthoringBridge,
  ProjectLocalAuthoringHostBinding,
  ProjectLocalCharacterEntitySelection,
} from '@neko/project/contracts';

const ResourceBrowserRoot = lazy(async () => {
  const module = await import('@neko/assets-webview/resource-browser/root');
  return { default: module.ResourceBrowserRoot };
});

export function DesktopResourceBrowserSurface({
  characterCreationAuthority,
  onCharacterCreated,
  project,
  projection,
  tab,
}: {
  readonly characterCreationAuthority?: {
    readonly workspaceId: string;
    readonly workspaceGrantId: string;
  };
  readonly onCharacterCreated?: (characterProjectId: string, displayName: string) => void;
  readonly project: DesktopProjectCatalogItem;
  readonly projection: DesktopShellProjection;
  readonly tab: DesktopProjectTabProjection;
}): JSX.Element {
  const { locale, t } = useTranslation();
  const applicationSettings = useDesktopApplicationSettings();
  const runtime = useMemo(
    () =>
      createElectronResourceBrowserHostRuntime({
        bridge: window.openNekoDesktop,
        identity: createDesktopResourceBrowserIdentity({
          projectId: project.projectId,
          workspaceId: project.workspaceId,
          windowId: projection.window.windowId,
          projectViewId: tab.viewId,
          projectViewInstanceId: tab.viewInstanceId,
          rendererSessionId: projection.rendererSessionId,
        }),
      }),
    [
      project.projectId,
      project.workspaceId,
      projection.rendererSessionId,
      projection.window.windowId,
      tab.viewInstanceId,
      tab.viewId,
    ],
  );
  const characterCreation = useMemo<ResourceBrowserCharacterCreation | undefined>(() => {
    if (!characterCreationAuthority || !onCharacterCreated) return undefined;
    const binding = {
      workspaceId: characterCreationAuthority.workspaceId,
      workspaceGrantId: characterCreationAuthority.workspaceGrantId,
      contentProjectId: project.projectId,
    };
    return {
      destinationLabel: project.displayName,
      create: (item, displayName) =>
        createDesktopProjectCharacterFromResource({
          binding,
          bridge: window.openNekoDesktop,
          displayName,
          item,
          onCreated: onCharacterCreated,
          windowId: projection.window.windowId,
        }),
    };
  }, [
    characterCreationAuthority,
    onCharacterCreated,
    project.displayName,
    project.projectId,
    projection.window.windowId,
  ]);
  return (
    <div className="desktop-resource-browser-root" data-owner-root="assets">
      <Suspense
        fallback={
          <div className="resource-dock-loading" role="status">
            {t('workspace.assets.loading')}
          </div>
        }
      >
        <ResourceBrowserRoot
          characterCreation={characterCreation}
          chrome="embedded"
          runtime={runtime}
          locale={locale}
          lifecyclePresentation="active"
          defaultViewMode={applicationSettings.projection.preferences.resourceBrowserView}
          previewTarget={{
            viewId: `preview:${tab.viewId}:temporary`,
            presentation: 'temporary',
          }}
        />
      </Suspense>
    </div>
  );
}

export async function createDesktopProjectCharacterFromResource(input: {
  readonly binding: ProjectLocalAuthoringHostBinding;
  readonly bridge: OpenNekoDesktopProjectLocalAuthoringBridge;
  readonly displayName: string;
  readonly item: ResourceBrowserItem;
  readonly onCreated: (characterProjectId: string, displayName: string) => void;
  readonly windowId: string;
  readonly createId?: () => string;
  readonly now?: () => string;
}): Promise<ResourceBrowserCharacterCreationOutcome> {
  const createId = input.createId ?? (() => globalThis.crypto.randomUUID());
  const characterProjectId = `character-project:${createId()}`;
  const source = characterCreationSourceFromResource({
    binding: input.binding,
    createId,
    entityName: input.displayName,
    item: input.item,
    observedAt: (input.now ?? (() => new Date().toISOString()))(),
  });
  const result = await input.bridge.projectLocalAuthoring.createTarget(
    input.windowId,
    input.binding,
    {
      kind: 'character-project',
      characterProjectId,
      displayName: input.displayName,
      draft: createEmptyCharacterDefinition(),
      sources: source.sources,
      entity: source.entity,
    },
  );
  const projectOutcome = (outcome: typeof result): ResourceBrowserCharacterCreationOutcome => {
    if (outcome.status === 'created') {
      input.onCreated(characterProjectId, input.displayName);
      return { status: 'created' };
    }
    return {
      status: 'incomplete',
      retry: async () =>
        projectOutcome(
          await input.bridge.projectLocalAuthoring.retryCharacter(
            input.windowId,
            input.binding,
            outcome.receipt,
            source.entity,
          ),
        ),
    };
  };
  return projectOutcome(result);
}

function characterCreationSourceFromResource(input: {
  readonly binding: ProjectLocalAuthoringHostBinding;
  readonly createId: () => string;
  readonly entityName: string;
  readonly item: ResourceBrowserItem;
  readonly observedAt: string;
}): {
  readonly sources: CharacterCreationSourceSelection;
  readonly entity: ProjectLocalCharacterEntitySelection;
} {
  if (input.item.source === 'files' || input.item.source === 'media') {
    if (input.item.role !== 'content') {
      throw new Error('Character creation requires an exact Content item.');
    }
    return {
      sources: {
        evidence: [
          {
            kind: 'content',
            evidenceId: `evidence:${input.createId()}`,
            sourceWorkspaceId: input.binding.workspaceId,
            sourceWorkspaceGrantId: input.binding.workspaceGrantId,
            locator: input.item.locator,
            observedAt: input.observedAt,
          },
        ],
        assetRepresentations: [],
      },
      entity: {
        kind: 'create',
        entityId: `entity:${input.createId()}`,
        name: input.entityName,
      },
    };
  }
  if (input.item.source === 'entities') {
    if (
      input.item.entityStatus !== 'confirmed' ||
      !('entityRef' in input.item) ||
      ('characterAssociation' in input.item && input.item.characterAssociation !== undefined)
    ) {
      throw new Error('Character creation requires an unassociated confirmed Project Entity.');
    }
    return {
      sources: {
        evidence: [
          {
            kind: 'project-entity',
            evidenceId: `evidence:${input.createId()}`,
            sourceWorkspaceId: input.binding.workspaceId,
            sourceWorkspaceGrantId: input.binding.workspaceGrantId,
            contentProjectId: input.binding.contentProjectId,
            entityId: input.item.entityRef.entityId,
            observedAt: input.observedAt,
          },
        ],
        assetRepresentations: [],
      },
      entity: { kind: 'existing', entityId: input.item.entityRef.entityId },
    };
  }
  throw new Error('Character creation requires exact Content or confirmed Entity context.');
}
