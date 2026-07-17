/**
 * Asset Protocol Types
 *
 * IPC protocol for communication between Extension Host and Webview
 * regarding asset management operations.
 */

import type {
  AssetEntity,
  AssetFile,
  AssetVariant,
  CreateEntityInput,
  CreateVariantInput,
  EntityCategory,
  UpdateEntityInput,
  UpdateVariantInput,
  AddFileOptions,
  MoveVariantInput,
  MoveVariantResult,
  MergeEntitiesInput,
  MergeEntitiesResult,
} from './entity';
import type { AssetQuery, SearchResult, SuggestedEntity } from './query';
import type { ClassificationResult, ClassifierOptions } from './classifier';

// =============================================================================
// Request Types (Webview → Extension)
// =============================================================================

/** Base request structure */
interface BaseAssetRequest {
  /** Unique request ID for response matching */
  requestId: string;
  /** Request timestamp */
  timestamp: number;
}

/** Create entity request */
export interface CreateEntityRequest extends BaseAssetRequest {
  type: 'asset:createEntity';
  payload: CreateEntityInput;
}

/** Get entity request */
export interface GetEntityRequest extends BaseAssetRequest {
  type: 'asset:getEntity';
  payload: { id: string };
}

/** Update entity request */
export interface UpdateEntityRequest extends BaseAssetRequest {
  type: 'asset:updateEntity';
  payload: { id: string; updates: UpdateEntityInput };
}

/** Delete entity request */
export interface DeleteEntityRequest extends BaseAssetRequest {
  type: 'asset:deleteEntity';
  payload: { id: string };
}

/** Search assets request */
export interface SearchAssetsRequest extends BaseAssetRequest {
  type: 'asset:search';
  payload: AssetQuery;
}

/** Get entities by category request */
export interface GetByCategoryRequest extends BaseAssetRequest {
  type: 'asset:getByCategory';
  payload: { category: EntityCategory };
}

/** Get entities by tags request */
export interface GetByTagsRequest extends BaseAssetRequest {
  type: 'asset:getByTags';
  payload: { tags: string[] };
}

/** Get recent entities request */
export interface GetRecentRequest extends BaseAssetRequest {
  type: 'asset:getRecent';
  payload: { limit?: number };
}

/** Add variant request */
export interface AddVariantRequest extends BaseAssetRequest {
  type: 'asset:addVariant';
  payload: { entityId: string; input: CreateVariantInput };
}

/** Update variant request */
export interface UpdateVariantRequest extends BaseAssetRequest {
  type: 'asset:updateVariant';
  payload: { entityId: string; variantId: string; updates: UpdateVariantInput };
}

/** Delete variant request */
export interface DeleteVariantRequest extends BaseAssetRequest {
  type: 'asset:deleteVariant';
  payload: { entityId: string; variantId: string };
}

/** Add file request */
export interface AddFileRequest extends BaseAssetRequest {
  type: 'asset:addFile';
  payload: { variantId: string; filePath: string; options?: AddFileOptions };
}

/** Remove file request */
export interface RemoveFileRequest extends BaseAssetRequest {
  type: 'asset:removeFile';
  payload: { variantId: string; fileId: string };
}

/** Classify file request */
export interface ClassifyFileRequest extends BaseAssetRequest {
  type: 'asset:classify';
  payload: { filePath: string; options?: ClassifierOptions };
}

/** Find similar entities request */
export interface FindSimilarRequest extends BaseAssetRequest {
  type: 'asset:findSimilar';
  payload: { filePath: string; options?: ClassifierOptions };
}

/** Import file request */
export interface ImportFileRequest extends BaseAssetRequest {
  type: 'asset:importFile';
  payload: {
    filePath: string;
    /** If provided, add to existing entity; otherwise create new */
    entityId?: string;
    /** If provided with entityId, add to existing variant */
    variantId?: string;
    /** Options for creating new entity/variant */
    createOptions?: {
      entityInput?: CreateEntityInput;
      variantInput?: CreateVariantInput;
      fileOptions?: AddFileOptions;
    };
    /** Whether to auto-classify if creating new entity */
    autoClassify?: boolean;
  };
}

/** Get all tags request */
export interface GetAllTagsRequest extends BaseAssetRequest {
  type: 'asset:getAllTags';
}

/** Record usage request */
export interface RecordUsageRequest extends BaseAssetRequest {
  type: 'asset:recordUsage';
  payload: { entityId: string };
}

/** Move variant to another entity request */
export interface MoveVariantRequest extends BaseAssetRequest {
  type: 'asset:moveVariant';
  payload: MoveVariantInput;
}

/** Merge two entities request */
export interface MergeEntitiesRequest extends BaseAssetRequest {
  type: 'asset:mergeEntities';
  payload: MergeEntitiesInput;
}

/** Compare two variants request (triggers VSCode diff editor) */
export interface CompareVariantsRequest extends BaseAssetRequest {
  type: 'asset:compareVariants';
  payload: {
    entityId: string;
    variantIdA: string;
    variantIdB: string;
  };
}

/** Union of all request types */
export type AssetRequest =
  | CreateEntityRequest
  | GetEntityRequest
  | UpdateEntityRequest
  | DeleteEntityRequest
  | SearchAssetsRequest
  | GetByCategoryRequest
  | GetByTagsRequest
  | GetRecentRequest
  | AddVariantRequest
  | UpdateVariantRequest
  | DeleteVariantRequest
  | AddFileRequest
  | RemoveFileRequest
  | ClassifyFileRequest
  | FindSimilarRequest
  | ImportFileRequest
  | GetAllTagsRequest
  | RecordUsageRequest
  | MoveVariantRequest
  | MergeEntitiesRequest
  | CompareVariantsRequest;

// =============================================================================
// Response Types (Extension → Webview)
// =============================================================================

/** Base response structure */
interface BaseAssetResponse {
  /** Corresponding request ID */
  requestId?: string;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  errorCode?: string;
}

/** Entity created response */
export interface EntityCreatedResponse extends BaseAssetResponse {
  type: 'asset:entityCreated';
  payload: AssetEntity;
}

/** Entity loaded response */
export interface EntityLoadedResponse extends BaseAssetResponse {
  type: 'asset:entityLoaded';
  payload: AssetEntity | null;
}

/** Entity updated response */
export interface EntityUpdatedResponse extends BaseAssetResponse {
  type: 'asset:entityUpdated';
  payload: AssetEntity;
}

/** Entity deleted response */
export interface EntityDeletedResponse extends BaseAssetResponse {
  type: 'asset:entityDeleted';
  payload: { id: string };
}

/** Search result response */
export interface SearchResultResponse extends BaseAssetResponse {
  type: 'asset:searchResult';
  payload: SearchResult;
}

/** Entities list response */
export interface EntitiesListResponse extends BaseAssetResponse {
  type: 'asset:entitiesList';
  payload: AssetEntity[];
}

/** Variant added response */
export interface VariantAddedResponse extends BaseAssetResponse {
  type: 'asset:variantAdded';
  payload: { entityId: string; variant: AssetVariant };
}

/** Variant updated response */
export interface VariantUpdatedResponse extends BaseAssetResponse {
  type: 'asset:variantUpdated';
  payload: { entityId: string; variant: AssetVariant };
}

/** Variant deleted response */
export interface VariantDeletedResponse extends BaseAssetResponse {
  type: 'asset:variantDeleted';
  payload: { entityId: string; variantId: string };
}

/** File added response */
export interface FileAddedResponse extends BaseAssetResponse {
  type: 'asset:fileAdded';
  payload: { variantId: string; file: AssetFile };
}

/** File removed response */
export interface FileRemovedResponse extends BaseAssetResponse {
  type: 'asset:fileRemoved';
  payload: { variantId: string; fileId: string };
}

/** Classification result response */
export interface ClassifyResultResponse extends BaseAssetResponse {
  type: 'asset:classifyResult';
  payload: ClassificationResult;
}

/** Similar entities response */
export interface SimilarEntitiesResponse extends BaseAssetResponse {
  type: 'asset:similarEntities';
  payload: SuggestedEntity[];
}

/** Import result response */
export interface ImportResultResponse extends BaseAssetResponse {
  type: 'asset:importResult';
  payload: {
    entity: AssetEntity;
    variant: AssetVariant;
    file: AssetFile;
    isNewEntity: boolean;
    isNewVariant: boolean;
  };
}

/** All tags response */
export interface AllTagsResponse extends BaseAssetResponse {
  type: 'asset:allTags';
  payload: Array<{ tag: string; count: number }>;
}

/** Usage recorded response */
export interface UsageRecordedResponse extends BaseAssetResponse {
  type: 'asset:usageRecorded';
  payload: { entityId: string; usageCount: number; lastUsedAt: number };
}

/** Variant moved response */
export interface VariantMovedResponse extends BaseAssetResponse {
  type: 'asset:variantMoved';
  payload: MoveVariantResult;
}

/** Entities merged response */
export interface EntitiesMergedResponse extends BaseAssetResponse {
  type: 'asset:entitiesMerged';
  payload: MergeEntitiesResult;
}

/** Error response */
export interface AssetErrorResponse extends BaseAssetResponse {
  type: 'asset:error';
  payload: { message: string; code: string };
}

/** Union of all response types */
export type AssetResponse =
  | EntityCreatedResponse
  | EntityLoadedResponse
  | EntityUpdatedResponse
  | EntityDeletedResponse
  | SearchResultResponse
  | EntitiesListResponse
  | VariantAddedResponse
  | VariantUpdatedResponse
  | VariantDeletedResponse
  | FileAddedResponse
  | FileRemovedResponse
  | ClassifyResultResponse
  | SimilarEntitiesResponse
  | ImportResultResponse
  | AllTagsResponse
  | UsageRecordedResponse
  | VariantMovedResponse
  | EntitiesMergedResponse
  | AssetErrorResponse;
