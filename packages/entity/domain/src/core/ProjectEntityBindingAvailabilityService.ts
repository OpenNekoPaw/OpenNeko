import {
  contentLocatorsEqual,
  isContentStat,
  type ContentLocator,
  type ContentReadOptions,
  type ContentStat,
} from '@neko/content';
import {
  ProjectEntityContractError,
  type EntityBindingAvailabilityProjectionValue,
  type ProjectEntityBindingAttentionAction,
  type ProjectEntityDocument,
  type ProjectEntityRepresentationBinding,
} from '../contracts/index';

export interface ProjectEntityBindingResourcePort {
  stat(locator: ContentLocator, options: ContentReadOptions): Promise<ContentStat>;
}

export interface ProjectEntityBindingAvailabilityServiceOptions {
  readonly content: ProjectEntityBindingResourcePort;
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
    const target = binding.target;
    const result = await this.options.content.stat(target, signal ? { signal } : {});
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
  if (binding.target.file.authority === 'package') return 'asset';
  return binding.target.selector?.kind === 'entry' ? 'document' : 'workspace-file';
}

function attentionAction(
  binding: ProjectEntityRepresentationBinding,
  stat: Extract<ContentStat, { readonly status: 'unavailable' }>,
): ProjectEntityBindingAttentionAction {
  if (stat.diagnostic.code === 'content-unauthorized') return 'reconnect';
  if (binding.target.file.authority === 'package' && stat.diagnostic.code === 'content-missing') {
    return 'reinstall';
  }
  if (stat.diagnostic.code === 'content-missing' || stat.diagnostic.code === 'content-changed') {
    return 'rebind';
  }
  return 'retry';
}
