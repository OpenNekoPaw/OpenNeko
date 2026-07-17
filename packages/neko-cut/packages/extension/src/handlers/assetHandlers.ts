/**
 * Asset Message Handler
 *
 * Handles asset-related messages from Webview.
 * Routes messages to AssetService for processing.
 */

import { getLogger } from '../base';
import type {
  AssetRequest,
  AssetResponse,
  CreateEntityInput,
  UpdateEntityInput,
  CreateVariantInput,
  UpdateVariantInput,
  AssetQuery,
  EntityCategory,
  AddFileOptions,
  MoveVariantInput,
  MergeEntitiesInput,
} from '@neko/shared';
import { getService } from '../base';
import { IAssetService, type AssetService, type ImportOptions } from '../services/AssetService';

const logger = getLogger('AssetMessageHandler');

// =============================================================================
// Message Handler
// =============================================================================

/**
 * Handle asset messages from Webview
 */
export async function handleAssetMessage(
  message: AssetRequest & { _requestId?: string },
  postMessage: (response: AssetResponse) => void,
): Promise<boolean> {
  // Helper to include _requestId in response for request-response pattern
  const respond = (response: AssetResponse) => {
    if (message._requestId) {
      postMessage({ ...response, _requestId: message._requestId } as AssetResponse);
    } else {
      postMessage(response);
    }
  };

  const assetService = getService<AssetService>(IAssetService);
  if (!assetService) {
    respond({
      type: 'asset:error',
      payload: { message: 'AssetService not available', code: 'SERVICE_NOT_AVAILABLE' },
    });
    return true;
  }

  try {
    switch (message.type) {
      // =====================================================================
      // Entity Operations
      // =====================================================================

      case 'asset:createEntity': {
        const entity = await assetService.createEntity(message.payload as CreateEntityInput);
        respond({ type: 'asset:entityCreated', payload: entity });
        return true;
      }

      case 'asset:getEntity': {
        const { id } = message.payload as { id: string };
        const entity = await assetService.getEntity(id);
        respond({ type: 'asset:entityLoaded', payload: entity });
        return true;
      }

      case 'asset:getAllEntities': {
        const entities = await assetService.getAllEntities();
        respond({ type: 'asset:entitiesLoaded', payload: entities });
        return true;
      }

      case 'asset:updateEntity': {
        const { id, updates } = message.payload as { id: string; updates: UpdateEntityInput };
        const entity = await assetService.updateEntity(id, updates);
        respond({ type: 'asset:entityUpdated', payload: entity });
        return true;
      }

      case 'asset:deleteEntity': {
        const { id } = message.payload as { id: string };
        const success = await assetService.deleteEntity(id);
        respond({ type: 'asset:entityDeleted', payload: { id, success } });
        return true;
      }

      case 'asset:getByCategory': {
        const { category } = message.payload as { category: EntityCategory };
        const entities = await assetService.getByCategory(category);
        respond({ type: 'asset:entitiesLoaded', payload: entities });
        return true;
      }

      case 'asset:getByTags': {
        const { tags } = message.payload as { tags: string[] };
        const entities = await assetService.getByTags(tags);
        respond({ type: 'asset:entitiesLoaded', payload: entities });
        return true;
      }

      case 'asset:getRecent': {
        const { limit } = message.payload as { limit?: number };
        const entities = await assetService.getRecent(limit);
        respond({ type: 'asset:entitiesLoaded', payload: entities });
        return true;
      }

      case 'asset:recordUsage': {
        const { id } = message.payload as { id: string };
        const entity = await assetService.recordUsage(id);
        respond({ type: 'asset:entityUpdated', payload: entity });
        return true;
      }

      // =====================================================================
      // Variant Operations
      // =====================================================================

      case 'asset:addVariant': {
        const { entityId, input } = message.payload as {
          entityId: string;
          input: CreateVariantInput;
        };
        const variant = await assetService.addVariant(entityId, input);
        respond({ type: 'asset:variantCreated', payload: variant });
        return true;
      }

      case 'asset:getVariant': {
        const { entityId, variantId } = message.payload as {
          entityId: string;
          variantId: string;
        };
        const variant = await assetService.getVariant(entityId, variantId);
        respond({ type: 'asset:variantLoaded', payload: variant });
        return true;
      }

      case 'asset:updateVariant': {
        const { entityId, variantId, updates } = message.payload as {
          entityId: string;
          variantId: string;
          updates: UpdateVariantInput;
        };
        const variant = await assetService.updateVariant(entityId, variantId, updates);
        respond({ type: 'asset:variantUpdated', payload: variant });
        return true;
      }

      case 'asset:deleteVariant': {
        const { entityId, variantId } = message.payload as {
          entityId: string;
          variantId: string;
        };
        const success = await assetService.deleteVariant(entityId, variantId);
        respond({ type: 'asset:variantDeleted', payload: { entityId, variantId, success } });
        return true;
      }

      case 'asset:moveVariant': {
        const input = message.payload as MoveVariantInput;
        const result = await assetService.moveVariant(input);
        respond({ type: 'asset:variantMoved', payload: result });
        return true;
      }

      case 'asset:mergeEntities': {
        const input = message.payload as MergeEntitiesInput;
        const result = await assetService.mergeEntities(input);
        respond({ type: 'asset:entitiesMerged', payload: result });
        return true;
      }

      case 'asset:compareVariants': {
        const { entityId, variantIdA, variantIdB } = message.payload as {
          entityId: string;
          variantIdA: string;
          variantIdB: string;
        };
        // Trigger VSCode command to open variant diff editor
        await vscode.commands.executeCommand(
          'neko.assetDiff.compareVariants',
          entityId,
          variantIdA,
          variantIdB,
        );
        respond({ type: 'asset:compareStarted', payload: { entityId, variantIdA, variantIdB } });
        return true;
      }

      // =====================================================================
      // File Operations
      // =====================================================================

      case 'asset:addFile': {
        const { variantId, filePath, options } = message.payload as {
          variantId: string;
          filePath: string;
          options?: AddFileOptions;
        };
        const file = await assetService.addFile(variantId, filePath, options);
        respond({ type: 'asset:fileAdded', payload: file });
        return true;
      }

      case 'asset:removeFile': {
        const { variantId, fileId } = message.payload as {
          variantId: string;
          fileId: string;
        };
        const success = await assetService.removeFile(variantId, fileId);
        respond({ type: 'asset:fileRemoved', payload: { variantId, fileId, success } });
        return true;
      }

      // =====================================================================
      // Search Operations
      // =====================================================================

      case 'asset:search': {
        const query = message.payload as AssetQuery;
        const result = await assetService.search(query);
        respond({ type: 'asset:searchResult', payload: result });
        return true;
      }

      case 'asset:getAllTags': {
        const tags = await assetService.getAllTags();
        respond({ type: 'asset:tagsLoaded', payload: tags });
        return true;
      }

      // =====================================================================
      // Import Operations
      // =====================================================================

      case 'asset:importFile': {
        const { filePath, options } = message.payload as {
          filePath: string;
          options?: ImportOptions;
        };
        const result = await assetService.importFile(filePath, options);
        respond({ type: 'asset:importResult', payload: result });
        return true;
      }

      case 'asset:importFromDialog': {
        const results = await assetService.importFromDialog();
        respond({ type: 'asset:importResults', payload: results });
        return true;
      }

      // =====================================================================
      // Classification Operations
      // =====================================================================

      case 'asset:classify': {
        const { filePath } = message.payload as { filePath: string };
        const result = await assetService.classifyFile(filePath);
        respond({ type: 'asset:classifyResult', payload: result });
        return true;
      }

      case 'asset:suggestTags': {
        const { filePath } = message.payload as { filePath: string };
        const tags = await assetService.suggestTags(filePath);
        respond({ type: 'asset:suggestedTags', payload: tags });
        return true;
      }

      // =====================================================================
      // Persistence
      // =====================================================================

      case 'asset:flush': {
        await assetService.flush();
        respond({ type: 'asset:flushed', payload: { success: true } });
        return true;
      }

      default:
        // Not an asset message
        return false;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error:', errorMessage);
    respond({
      type: 'asset:error',
      payload: { message: errorMessage, code: 'OPERATION_FAILED' },
    });
    return true;
  }
}

/**
 * Check if a message is an asset message
 */
export function isAssetMessage(message: unknown): message is AssetRequest {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const type = (message as { type?: string }).type;
  return typeof type === 'string' && type.startsWith('asset:');
}
