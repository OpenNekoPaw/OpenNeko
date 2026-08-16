import {
  contentLocatorsEqual,
  isContentStat,
  type ContentReadOptions,
  type ContentStat,
  type DocumentEntryContentLocator,
  type GeneratedOutputContentLocator,
  type PackageResourceContentLocator,
  type WorkspaceFileContentLocator,
} from '@neko/content';
import {
  ProjectEntityContractError,
  type EntityBindingAvailabilityProjectionValue,
  type ProjectEntityBindingAttentionAction,
  type ProjectEntityDocument,
  type ProjectEntityRepresentationBinding,
} from '../contracts/index';

export interface ProjectEntityBindingResourcePort<TLocator> {
  stat(locator: TLocator, options: ContentReadOptions): Promise<ContentStat>;
}

export interface ProjectEntityBindingAvailabilityServiceOptions {
  readonly workspaceFile: ProjectEntityBindingResourcePort<WorkspaceFileContentLocator>;
  readonly documentEntry: ProjectEntityBindingResourcePort<DocumentEntryContentLocator>;
  readonly generatedOutput: ProjectEntityBindingResourcePort<GeneratedOutputContentLocator>;
  readonly packageResource: ProjectEntityBindingResourcePort<PackageResourceContentLocator>;
}

export class ProjectEntityBindingAvailabilityService {
  constructor(private readonly options: ProjectEntityBindingAvailabilityServiceOptions) {}

  async project(
    document: ProjectEntityDocument,
    checkedAt: string,
    signal?: AbortSignal,
  ): Promise<readonly EntityBindingAvailabilityProjectionValue[]> {
    const results: EntityBindingAvailabilityProjectionValue[] = [];
    for (const entity of document.entities) {
      for (const binding of entity.representations) {
        const stat = await this.stat(binding, signal);
        if (stat.status === 'unavailable' && stat.diagnostic.code === 'content-cancelled') {
          throw new ProjectEntityContractError([
            {
              code: 'project-entity-operation-cancelled',
              message: 'Project Entity binding availability projection was cancelled.',
              entityId: entity.entityId,
              bindingId: binding.bindingId,
            },
          ]);
        }
        results.push({
          bindingId: binding.bindingId,
          entityId: entity.entityId,
          entityKind: entity.kind,
          representation: binding.target,
          role: binding.role,
          owner: bindingOwner(binding),
          availability: stat.status === 'ready' ? 'available' : 'needs-attention',
          ...(stat.status === 'unavailable'
            ? { attention: { diagnostic: stat.diagnostic, action: attentionAction(binding, stat) } }
            : {}),
          ...(binding.isDefault ? { isDefault: true } : {}),
          checkedAt,
        });
      }
    }
    return results;
  }

  private async stat(
    binding: ProjectEntityRepresentationBinding,
    signal?: AbortSignal,
  ): Promise<ContentStat> {
    const options = signal ? { signal } : {};
    const target = binding.target;
    const result = await (target.kind === 'workspace-file'
      ? this.options.workspaceFile.stat(target, options)
      : target.kind === 'document-entry'
        ? this.options.documentEntry.stat(target, options)
        : target.kind === 'generated-output'
          ? this.options.generatedOutput.stat(target, options)
          : this.options.packageResource.stat(target, options));
    if (!isContentStat(result) || !contentLocatorsEqual(result.locator, target)) {
      throw new ProjectEntityContractError([
        {
          code: 'project-entity-binding-unavailable',
          message: `Project Entity binding owner returned an invalid result for '${binding.bindingId}'.`,
          bindingId: binding.bindingId,
        },
      ]);
    }
    return result;
  }
}

function bindingOwner(
  binding: ProjectEntityRepresentationBinding,
): EntityBindingAvailabilityProjectionValue['owner'] {
  switch (binding.target.kind) {
    case 'workspace-file':
      return 'workspace-file';
    case 'document-entry':
      return 'document';
    case 'generated-output':
      return 'generated-output';
    case 'package-resource':
      return 'asset';
  }
}

function attentionAction(
  binding: ProjectEntityRepresentationBinding,
  stat: Extract<ContentStat, { readonly status: 'unavailable' }>,
): ProjectEntityBindingAttentionAction {
  if (stat.diagnostic.code === 'content-unauthorized') return 'reconnect';
  if (binding.target.kind === 'package-resource' && stat.diagnostic.code === 'content-missing') {
    return 'reinstall';
  }
  if (stat.diagnostic.code === 'content-missing' || stat.diagnostic.code === 'content-changed') {
    return 'rebind';
  }
  return 'retry';
}
