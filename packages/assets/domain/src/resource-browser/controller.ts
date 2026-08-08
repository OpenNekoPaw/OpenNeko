import {
  RESOURCE_BROWSER_ROUTES,
  ResourceBrowserContractError,
  assertResourceBrowserIdentity,
  parseResourceBrowserChildrenRequest,
  parseResourceBrowserIntentRequest,
  parseResourceBrowserProjection,
  parseResourceBrowserSearchRequest,
  parseResourceBrowserThumbnailRequest,
  parseResourceBrowserThumbnailResult,
  type ResourceBrowserFacet,
  type ResourceBrowserChildrenRequest,
  type ResourceBrowserContentItem,
  type ResourceBrowserHostRuntime,
  type ResourceBrowserIdentity,
  type ResourceBrowserIntentRequest,
  type ResourceBrowserItem,
  type ResourceBrowserProjection,
  type ResourceBrowserProjectionEvent,
  type ResourceBrowserQuickPreviewReleaseRequest,
  type ResourceBrowserQuickPreviewReleaseResult,
  type ResourceBrowserQuickPreviewRequest,
  type ResourceBrowserQuickPreviewResult,
  type ResourceBrowserRecoveryApplyRequest,
  type ResourceBrowserRecoveryCancelRequest,
  type ResourceBrowserRecoveryCancelResult,
  type ResourceBrowserRecoveryPlanRequest,
  type ResourceBrowserRecoveryPlanResult,
  type ResourceBrowserSearchRequest,
  type ResourceBrowserThumbnailRequest,
  type ResourceBrowserThumbnailResult,
} from './contract';
import {
  presentResourceBrowserAssetItem,
  presentResourceBrowserContentItem,
  presentResourceBrowserEntityItem,
} from './presenter';
import type { ResourceBrowserInteractionPort, ResourceBrowserProjectionSource } from './ports';

export interface ResourceBrowserControllerOptions {
  readonly identity: ResourceBrowserIdentity;
  readonly source: ResourceBrowserProjectionSource;
  readonly interactions: ResourceBrowserInteractionPort;
  readonly initialFacet?: ResourceBrowserFacet;
  readonly canvasAvailable?: boolean;
}

export class ResourceBrowserController implements ResourceBrowserHostRuntime {
  readonly identity: ResourceBrowserIdentity;
  private readonly listeners = new Set<(event: ResourceBrowserProjectionEvent) => void>();
  private readonly projections = new Map<ResourceBrowserFacet, ResourceBrowserProjection>();
  private readonly loadedContainerIds = {
    files: new Set<string>(),
    media: new Set<string>(),
  };
  private activeFacet: ResourceBrowserFacet;
  private activeSearchRequestId: string | undefined;
  private sequence = 0;
  private disposed = false;

  constructor(private readonly options: ResourceBrowserControllerOptions) {
    this.identity = options.identity;
    this.activeFacet = options.initialFacet ?? 'files';
  }

  async getSnapshot(): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const existing = this.projections.get(this.activeFacet);
    if (existing) return existing;
    const projection = await this.readProjection(this.activeFacet, '', 100);
    this.projections.set(this.activeFacet, projection);
    return projection;
  }

  subscribe(listener: (event: ResourceBrowserProjectionEvent) => void): () => void {
    this.requireActive();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async search(request: ResourceBrowserSearchRequest): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const parsed = parseResourceBrowserSearchRequest(request);
    assertResourceBrowserIdentity(this.identity, parsed.identity);
    const current = await this.getSnapshot();
    this.activeSearchRequestId = parsed.requestId;
    const retained = this.projections.get(parsed.facet);
    if (retained?.query === parsed.query) {
      this.activeFacet = parsed.facet;
      this.publish(retained);
      return retained;
    }
    const nextProjection = await this.readProjection(parsed.facet, parsed.query, parsed.limit);
    if (parsed.requestId !== this.activeSearchRequestId) {
      return this.projections.get(this.activeFacet) ?? current;
    }
    return this.commitProjection(nextProjection);
  }

  async children(request: ResourceBrowserChildrenRequest): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const parsed = parseResourceBrowserChildrenRequest(request);
    assertResourceBrowserIdentity(this.identity, parsed.identity);
    const current = this.projections.get(parsed.facet);
    if (!current) {
      throw new ResourceBrowserContractError(
        'resource-browser-stale-identity',
        'Resource Browser children request targets a facet that is not open.',
      );
    }
    if (current.facet !== parsed.facet || current.query.length > 0) {
      throw new ResourceBrowserContractError(
        'resource-browser-stale-identity',
        'Resource Browser children request does not match the active browsing projection.',
      );
    }
    const parent = current.items.find(
      (candidate): candidate is ResourceBrowserContentItem =>
        candidate.resourceId === parsed.parentResourceId && candidate.facet === parsed.facet,
    );
    if (!parent || (parent.role !== 'directory' && parent.role !== 'library-root')) {
      throw new ResourceBrowserContractError(
        'resource-browser-stale-identity',
        `Resource Browser parent '${parsed.parentResourceId}' is stale or not expandable.`,
      );
    }
    const entries =
      parsed.facet === 'files'
        ? await this.options.source.files.children({
            identity: this.identity,
            parent,
            limit: parsed.limit,
          })
        : await this.options.source.media.children({
            identity: this.identity,
            parent,
            limit: parsed.limit,
          });
    const children = entries.map((entry) =>
      presentResourceBrowserContentItem(entry, parsed.facet, {
        canvasAvailable: this.options.canvasAvailable,
      }),
    );
    this.loadedContainerIds[parsed.facet].add(parent.resourceId);
    const childIds = new Set(children.map((item) => item.resourceId));
    const nextItems = current.items.filter(
      (item) => item.parentResourceId !== parent.resourceId || childIds.has(item.resourceId),
    );
    for (const child of children) {
      const index = nextItems.findIndex((candidate) => candidate.resourceId === child.resourceId);
      if (index >= 0) nextItems[index] = child;
      else nextItems.push(child);
    }
    return this.commitProjection(
      parseResourceBrowserProjection({
        ...current,
        items: nextItems,
      }),
    );
  }

  async resolveThumbnail(
    request: ResourceBrowserThumbnailRequest,
  ): Promise<ResourceBrowserThumbnailResult> {
    this.requireActive();
    const parsed = parseResourceBrowserThumbnailRequest(request);
    assertResourceBrowserIdentity(this.identity, parsed.identity);
    const current = await this.getSnapshot();
    const item = current.items.find((candidate) => candidate.resourceId === parsed.resourceId);
    if (
      !item?.thumbnail ||
      item.thumbnail.descriptorId !== parsed.descriptorId ||
      item.thumbnail.sourceFingerprint !== parsed.sourceFingerprint
    ) {
      throw new ResourceBrowserContractError(
        'resource-browser-stale-identity',
        `Resource Browser thumbnail '${parsed.descriptorId}' is stale.`,
      );
    }
    return parseResourceBrowserThumbnailResult({
      requestId: parsed.requestId,
      identity: this.identity,
      resourceId: item.resourceId,
      descriptorId: item.thumbnail.descriptorId,
      sourceFingerprint: item.thumbnail.sourceFingerprint,
      dataUrl: await this.options.interactions.resolveThumbnail({
        identity: this.identity,
        item,
        descriptor: item.thumbnail,
      }),
    });
  }

  async resolveQuickPreview(
    _request: ResourceBrowserQuickPreviewRequest,
  ): Promise<ResourceBrowserQuickPreviewResult> {
    throw new Error('Resource Browser quick Preview requires a Host-owned descriptor runtime.');
  }

  async releaseQuickPreview(
    _request: ResourceBrowserQuickPreviewReleaseRequest,
  ): Promise<ResourceBrowserQuickPreviewReleaseResult> {
    throw new Error('Resource Browser quick Preview requires a Host-owned descriptor runtime.');
  }

  async planRecovery(
    _request: ResourceBrowserRecoveryPlanRequest,
  ): Promise<ResourceBrowserRecoveryPlanResult> {
    throw new Error('Resource Browser recovery planning requires a Host-owned runtime.');
  }

  async applyRecovery(
    _request: ResourceBrowserRecoveryApplyRequest,
  ): Promise<ResourceBrowserProjection> {
    throw new Error('Resource Browser recovery apply requires a Host-owned runtime.');
  }

  async cancelRecovery(
    _request: ResourceBrowserRecoveryCancelRequest,
  ): Promise<ResourceBrowserRecoveryCancelResult> {
    throw new Error('Resource Browser recovery cancellation requires a Host-owned runtime.');
  }

  async execute(request: ResourceBrowserIntentRequest): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const parsed = parseResourceBrowserIntentRequest(request);
    assertResourceBrowserIdentity(this.identity, parsed.identity);
    const current = await this.getSnapshot();
    if (parsed.route === RESOURCE_BROWSER_ROUTES.reconcile) {
      if (
        !current.diagnostics?.some(
          (diagnostic) => diagnostic.code === 'workspace-observation-failed',
        )
      ) {
        throw new ResourceBrowserContractError(
          'invalid-resource-browser-payload',
          'Resource Browser Rescan is available only after an observation failure.',
        );
      }
      return this.reconcile();
    }
    if (
      parsed.route === RESOURCE_BROWSER_ROUTES.linkGlobalLibrary ||
      parsed.route === RESOURCE_BROWSER_ROUTES.addDirectoryLibrary
    ) {
      const result =
        parsed.route === RESOURCE_BROWSER_ROUTES.linkGlobalLibrary
          ? await this.options.interactions.linkGlobalLibrary({ identity: this.identity })
          : await this.options.interactions.addDirectoryLibrary({ identity: this.identity });
      if (result === 'cancelled') return current;
      await this.options.source.refresh(this.identity);
      const projection = await this.readProjection(current.facet, current.query, 100);
      return this.commitProjection(projection);
    }
    if (
      parsed.route === RESOURCE_BROWSER_ROUTES.createFile ||
      parsed.route === RESOURCE_BROWSER_ROUTES.createDirectory ||
      parsed.route === RESOURCE_BROWSER_ROUTES.createCreativeDocument
    ) {
      if (current.facet !== 'files' || current.query.length > 0) {
        throw new ResourceBrowserContractError(
          'invalid-resource-browser-payload',
          'Resource Browser Workspace File creation requires the unfiltered Files facet.',
        );
      }
      const target = parsed.resourceId
        ? current.items.find(
            (candidate): candidate is ResourceBrowserContentItem =>
              candidate.resourceId === parsed.resourceId && candidate.facet === 'files',
          )
        : undefined;
      if (parsed.resourceId && !target) {
        throw new ResourceBrowserContractError(
          'resource-browser-stale-identity',
          'Resource Browser Workspace entry target is stale.',
        );
      }
      const parent = resolveCreationParent(current.items, target);
      if (!parsed.entryName) {
        throw new ResourceBrowserContractError(
          'invalid-resource-browser-payload',
          'Resource Browser entry name is required.',
        );
      }
      if (parsed.route === RESOURCE_BROWSER_ROUTES.createCreativeDocument) {
        if (!parsed.documentKind) {
          throw new ResourceBrowserContractError(
            'invalid-resource-browser-payload',
            'Resource Browser creative document kind is required.',
          );
        }
        const outcome = await this.options.interactions.createCreativeDocument({
          identity: this.identity,
          ...(parent ? { parent } : {}),
          kind: parsed.documentKind,
          name: parsed.entryName,
        });
        await this.options.source.refresh(this.identity);
        const projection = await this.readFilesMutationProjection(current, parent);
        return this.commitProjection(
          outcome.status === 'created'
            ? {
                ...projection,
                diagnostics: [...(projection.diagnostics ?? []), outcome.diagnostic],
              }
            : projection,
        );
      } else if (parsed.route === RESOURCE_BROWSER_ROUTES.createFile) {
        await this.options.interactions.createFile({
          identity: this.identity,
          ...(parent ? { parent } : {}),
          name: parsed.entryName,
        });
      } else {
        await this.options.interactions.createDirectory({
          identity: this.identity,
          ...(parent ? { parent } : {}),
          name: parsed.entryName,
        });
      }
      await this.options.source.refresh(this.identity);
      return this.commitProjection(await this.readFilesMutationProjection(current, parent));
    }
    const item = current.items.find((candidate) => candidate.resourceId === parsed.resourceId);
    if (!item) {
      throw new ResourceBrowserContractError(
        'resource-browser-stale-identity',
        `Resource Browser item '${parsed.resourceId}' is stale.`,
      );
    }
    if (
      parsed.route === RESOURCE_BROWSER_ROUTES.relinkSource ||
      parsed.route === RESOURCE_BROWSER_ROUTES.removeSource
    ) {
      if (item.role !== 'library-root' || !item.libraryName) {
        throw new ResourceBrowserContractError(
          'invalid-resource-browser-payload',
          'Resource Browser media library management requires a library root.',
        );
      }
      if (parsed.route === RESOURCE_BROWSER_ROUTES.relinkSource) {
        const result = await this.options.interactions.relinkSource({
          identity: this.identity,
          item,
        });
        if (result === 'cancelled') return current;
      } else {
        await this.options.interactions.removeSource({
          identity: this.identity,
          item,
        });
      }
      await this.options.source.refresh(this.identity);
      const projection = await this.readProjection(current.facet, current.query, 100);
      return this.commitProjection(projection);
    }
    if (parsed.route === RESOURCE_BROWSER_ROUTES.manageEntity) {
      if (item.facet !== 'entities' || !parsed.entityIntent) {
        throw new ResourceBrowserContractError(
          'invalid-resource-browser-payload',
          'Resource Browser Entity management requires an Entity item and intent.',
        );
      }
      assertEntityIntentMatchesItem(item, parsed.entityIntent);
      await this.options.interactions.manageEntity({
        identity: this.identity,
        item,
        intent: parsed.entityIntent,
      });
      const projection = await this.readProjection('entities', current.query, 100);
      return this.commitProjection(projection);
    }
    if (parsed.route === RESOURCE_BROWSER_ROUTES.trashContent) {
      if (item.facet !== 'files') {
        throw new ResourceBrowserContractError(
          'invalid-resource-browser-payload',
          'Resource Browser Trash is available only for Workspace Files.',
        );
      }
      await this.options.interactions.trashContent({
        identity: this.identity,
        item,
      });
      await this.options.source.refresh(this.identity);
      return this.commitProjection(await this.readProjection('files', '', 100));
    }
    switch (parsed.route) {
      case RESOURCE_BROWSER_ROUTES.editText:
        if (item.facet !== 'files' || !item.capabilities.includes('edit-text')) {
          throw new ResourceBrowserContractError(
            'invalid-resource-browser-payload',
            'Resource Browser Text Editor requires an admitted Workspace File.',
          );
        }
        await this.options.interactions.editText({ identity: this.identity, item });
        break;
      case RESOURCE_BROWSER_ROUTES.preview:
        if (!parsed.targetPreview) {
          throw new ResourceBrowserContractError(
            'invalid-resource-browser-payload',
            'Resource Browser Preview target is required.',
          );
        }
        await this.options.interactions.preview({
          identity: this.identity,
          item,
          target: parsed.targetPreview,
        });
        break;
      case RESOURCE_BROWSER_ROUTES.openCreativeDocument:
        if (item.facet !== 'files' && item.facet !== 'media') {
          throw new ResourceBrowserContractError(
            'invalid-resource-browser-payload',
            'Creative documents must be opened from Workspace content.',
          );
        }
        await this.options.interactions.openCreativeDocument({ identity: this.identity, item });
        break;
      case RESOURCE_BROWSER_ROUTES.reveal:
        await this.options.interactions.reveal({ identity: this.identity, item });
        break;
      case RESOURCE_BROWSER_ROUTES.addToCanvas:
        if (!parsed.targetCanvas) {
          throw new ResourceBrowserContractError(
            'invalid-resource-browser-payload',
            'Resource Browser add-to-Canvas target is required.',
          );
        }
        await this.options.interactions.addToCanvas({
          identity: this.identity,
          item,
          target: parsed.targetCanvas,
        });
        break;
      case RESOURCE_BROWSER_ROUTES.addToCut:
        if (!parsed.targetCut) {
          throw new ResourceBrowserContractError(
            'invalid-resource-browser-payload',
            'Resource Browser add-to-Cut target is required.',
          );
        }
        await this.options.interactions.addToCut({
          identity: this.identity,
          item,
          target: parsed.targetCut,
        });
        break;
    }
    return current;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.projections.clear();
    this.loadedContainerIds.files.clear();
    this.loadedContainerIds.media.clear();
    this.activeSearchRequestId = undefined;
    this.listeners.clear();
  }

  async reconcile(): Promise<ResourceBrowserProjection> {
    this.requireActive();
    const current = await this.getSnapshot();
    await this.options.source.refresh(this.identity);
    const retainedFiles = this.projections.get('files');
    if (retainedFiles && current.facet !== 'files') {
      this.projections.set(
        'files',
        await this.readRetainedContentProjection('files', retainedFiles),
      );
    }
    const projection =
      current.facet === 'files' || current.facet === 'media'
        ? await this.readRetainedContentProjection(current.facet, current)
        : await this.readProjection(current.facet, current.query, 100);
    return this.commitProjection(projection);
  }

  async reportObservationFailure(message: string): Promise<void> {
    this.requireActive();
    const current = await this.getSnapshot();
    this.requireActive();
    const diagnostics = [
      ...(current.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.code !== 'workspace-observation-failed',
      ),
      { code: 'workspace-observation-failed', message },
    ];
    this.commitProjection({ ...current, diagnostics });
  }

  private commitProjection(projection: ResourceBrowserProjection): ResourceBrowserProjection {
    this.projections.set(projection.facet, projection);
    this.activeFacet = projection.facet;
    this.publish(projection);
    return projection;
  }

  private async readProjection(
    facet: ResourceBrowserFacet,
    query: string,
    limit: number,
  ): Promise<ResourceBrowserProjection> {
    const entityResult = facet === 'entities' ? await this.readEntities(query, limit) : undefined;
    const items =
      facet === 'files'
        ? (await this.options.source.files.list({ identity: this.identity, query, limit })).map(
            (entry) =>
              presentResourceBrowserContentItem(entry, 'files', {
                canvasAvailable: this.options.canvasAvailable,
              }),
          )
        : facet === 'media'
          ? (
              await this.options.source.media.search({
                identity: this.identity,
                query,
                limit,
              })
            ).map((entry) =>
              presentResourceBrowserContentItem(entry, 'media', {
                canvasAvailable: this.options.canvasAvailable,
              }),
            )
          : facet === 'assets'
            ? (
                await this.options.source.assets.list({
                  identity: this.identity,
                  query,
                  limit,
                })
              ).map(presentResourceBrowserAssetItem)
            : (entityResult?.items ?? []);
    return parseResourceBrowserProjection({
      identity: this.identity,
      facet,
      query,
      items,
      ...(entityResult?.diagnostics.length ? { diagnostics: entityResult.diagnostics } : {}),
    });
  }

  private async readFilesMutationProjection(
    current: ResourceBrowserProjection,
    targetParent: ResourceBrowserContentItem | undefined,
  ): Promise<ResourceBrowserProjection> {
    let projection = await this.readProjection('files', '', 100);
    if (!targetParent) return projection;

    const lineage: ResourceBrowserContentItem[] = [];
    let cursor: ResourceBrowserContentItem | undefined = targetParent;
    while (cursor) {
      if (cursor.kind !== 'directory') {
        throw new ResourceBrowserContractError(
          'resource-browser-stale-identity',
          'Resource Browser creation parent is no longer a directory.',
        );
      }
      lineage.unshift(cursor);
      if (!cursor.parentResourceId) break;
      cursor = current.items.find(
        (candidate): candidate is ResourceBrowserContentItem =>
          candidate.resourceId === cursor?.parentResourceId && candidate.facet === 'files',
      );
      if (!cursor) {
        throw new ResourceBrowserContractError(
          'resource-browser-stale-identity',
          'Resource Browser creation parent lineage is stale.',
        );
      }
    }

    for (const retainedParent of lineage) {
      const refreshedParent = projection.items.find(
        (candidate): candidate is ResourceBrowserContentItem =>
          candidate.resourceId === retainedParent.resourceId && candidate.facet === 'files',
      );
      if (!refreshedParent || refreshedParent.kind !== 'directory') {
        throw new ResourceBrowserContractError(
          'resource-browser-stale-identity',
          `Resource Browser creation parent '${retainedParent.resourceId}' is unavailable after publication.`,
        );
      }
      const children = (
        await this.options.source.files.children({
          identity: this.identity,
          parent: refreshedParent,
          limit: 100,
        })
      ).map((entry) =>
        presentResourceBrowserContentItem(entry, 'files', {
          canvasAvailable: this.options.canvasAvailable,
        }),
      );
      this.loadedContainerIds.files.add(refreshedParent.resourceId);
      const childIds = new Set(children.map((item) => item.resourceId));
      const items = projection.items.filter(
        (item) =>
          item.parentResourceId !== refreshedParent.resourceId || childIds.has(item.resourceId),
      );
      for (const child of children) {
        const index = items.findIndex((candidate) => candidate.resourceId === child.resourceId);
        if (index >= 0) items[index] = child;
        else items.push(child);
      }
      projection = parseResourceBrowserProjection({ ...projection, items });
    }
    return projection;
  }

  private async readRetainedContentProjection(
    facet: 'files' | 'media',
    current: ResourceBrowserProjection,
  ): Promise<ResourceBrowserProjection> {
    let projection = await this.readProjection(facet, current.query, 100);
    if (current.query.length > 0) return projection;

    const loadedIds = this.loadedContainerIds[facet];
    const retainedParents = current.items
      .filter(
        (candidate): candidate is ResourceBrowserContentItem =>
          candidate.facet === facet &&
          (candidate.role === 'directory' || candidate.role === 'library-root') &&
          loadedIds.has(candidate.resourceId),
      )
      .sort((left, right) => left.depth - right.depth);
    const survivingIds = new Set<string>();
    for (const retainedParent of retainedParents) {
      const refreshedParent = projection.items.find(
        (candidate): candidate is ResourceBrowserContentItem =>
          candidate.resourceId === retainedParent.resourceId &&
          candidate.facet === facet &&
          (candidate.role === 'directory' || candidate.role === 'library-root'),
      );
      if (!refreshedParent) continue;
      const entries =
        facet === 'files'
          ? await this.options.source.files.children({
              identity: this.identity,
              parent: refreshedParent,
              limit: 100,
            })
          : await this.options.source.media.children({
              identity: this.identity,
              parent: refreshedParent,
              limit: 100,
            });
      const children = entries.map((entry) =>
        presentResourceBrowserContentItem(entry, facet, {
          canvasAvailable: this.options.canvasAvailable,
        }),
      );
      const childIds = new Set(children.map((item) => item.resourceId));
      const items = projection.items.filter(
        (item) =>
          item.parentResourceId !== refreshedParent.resourceId || childIds.has(item.resourceId),
      );
      for (const child of children) {
        const index = items.findIndex((candidate) => candidate.resourceId === child.resourceId);
        if (index >= 0) items[index] = child;
        else items.push(child);
      }
      projection = parseResourceBrowserProjection({ ...projection, items });
      survivingIds.add(refreshedParent.resourceId);
    }
    loadedIds.clear();
    for (const resourceId of survivingIds) loadedIds.add(resourceId);
    return projection;
  }

  private async readEntities(query: string, limit: number) {
    const result = await this.options.source.entities.list({
      identity: this.identity,
      query,
      limit,
    });
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const items = result.projections
      .filter((projection) => {
        const names =
          projection.status === 'candidate'
            ? projection.candidate.proposedNames
            : projection.entity.names;
        return normalizedQuery.length === 0
          ? true
          : [names.canonical, names.display, ...names.aliases]
              .filter((value): value is string => typeof value === 'string')
              .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
      })
      .slice(0, limit)
      .map((projection) =>
        presentResourceBrowserEntityItem(projection, {
          canvasAvailable: this.options.canvasAvailable,
          capabilities: result.inspectorCapabilities?.find(
            (candidate) => candidate.projectionId === projection.projectionId,
          )?.capabilities,
        }),
      );
    return {
      items,
      diagnostics: (result.diagnostics ?? []).map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.entityId ? { recordId: diagnostic.entityId } : {}),
      })),
    };
  }

  private publish(projection: ResourceBrowserProjection): void {
    this.sequence += 1;
    const event: ResourceBrowserProjectionEvent = {
      sequence: this.sequence,
      projection,
    };
    for (const listener of this.listeners) listener(event);
  }

  private requireActive(): void {
    if (this.disposed) {
      throw new Error('Resource Browser controller is disposed.');
    }
  }
}

function resolveCreationParent(
  items: readonly ResourceBrowserItem[],
  target: ResourceBrowserContentItem | undefined,
): ResourceBrowserContentItem | undefined {
  if (!target) return undefined;
  if (target.kind === 'directory') return target;
  if (!target.parentResourceId) return undefined;
  const parent = items.find(
    (candidate): candidate is ResourceBrowserContentItem =>
      candidate.resourceId === target.parentResourceId &&
      candidate.facet === 'files' &&
      candidate.kind === 'directory',
  );
  if (!parent) {
    throw new ResourceBrowserContractError(
      'resource-browser-stale-identity',
      'Resource Browser selected file parent is stale.',
    );
  }
  return parent;
}

function assertEntityIntentMatchesItem(
  item: Extract<ResourceBrowserItem, { readonly facet: 'entities' }>,
  intent: NonNullable<ResourceBrowserIntentRequest['entityIntent']>,
): void {
  if (!item.inspector.operations.includes(intent.type)) {
    throw new ResourceBrowserContractError(
      'invalid-resource-browser-payload',
      `Resource Browser Entity operation '${intent.type}' is not available.`,
    );
  }
  const intentEntityId = 'entityId' in intent ? intent.entityId : undefined;
  const intentCandidateId = 'candidateId' in intent ? intent.candidateId : undefined;
  if (
    item.entityStatus === 'candidate'
      ? intentCandidateId !== item.candidateRef.candidateId
      : intentEntityId !== item.entityRef.entityId
  ) {
    throw new ResourceBrowserContractError(
      'resource-browser-stale-identity',
      'Resource Browser Entity intent identity is stale.',
    );
  }
}
