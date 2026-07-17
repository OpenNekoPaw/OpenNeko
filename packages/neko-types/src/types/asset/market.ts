/**
 * Market types and Layer 0 interfaces.
 *
 * These contracts are shared by the neko-market HTTP client, install runtime,
 * VSCode extension adapter, webview message projection, and consumer packages.
 *
 * @see docs/architecture/marketplace.md
 * @see docs/architecture/registry-server-contract.md
 */

import type {
  AssetCategory,
  AssetCompatibility,
  AssetDeprecation,
  AssetManifest,
  AssetType,
  DistributionKind,
  LocalAssetStorageMode,
  ModelVariant,
  PluginPermission,
  ProxyVariant,
  SparseItem,
} from './manifest';

export type {
  AssetCategory,
  AssetCompatibility,
  AssetDistribution,
  AssetManifestSource,
  AssetPricing,
  DistributionKind,
  EffectsManifest,
  LargeAssetStrategy,
  LocalAssetStorageMode,
  ModelVariant,
  PackageEmbeddings,
  ProxyVariant,
  SkillMarketMetadata,
  SparseItem,
} from './manifest';

// =============================================================================
// Search / Browsing
// =============================================================================

export type MarketSortField = 'featured' | 'trending' | 'created' | 'downloads' | 'rating';
export type MarketSortOrder = 'asc' | 'desc';
export type MarketPricingFilter = 'free' | 'paid' | 'all';
export type MarketVisibility = 'public' | 'private' | 'shared' | 'paid';

export type MarketFacetValue = string | number | boolean | readonly (string | number | boolean)[];

export interface MarketRangeFacet {
  min?: number;
  max?: number;
}

export interface MarketSearchQuery {
  text?: string;
  types?: AssetType[];
  category?: AssetCategory;
  tags?: string[];
  visibility?: MarketVisibility[];
  pricing?: MarketPricingFilter;
  publisher?: string;
  sort?: MarketSortField;
  order?: MarketSortOrder;
  semantic?: Record<string, MarketFacetValue | MarketRangeFacet>;
  intent?: {
    useCases?: string[];
    audience?: string | string[];
    workflowStage?: string | string[];
    domain?: string | string[];
    notFor?: string | string[];
    [field: string]: string | string[] | undefined;
  };
  embedding?: {
    modelId: string;
    query: string;
  };
  limit?: number;
  offset?: number;
  cursor?: string;
}

export interface MarketSearchResult {
  items: MarketPackage[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

export type MarketInstallState = 'not-installed' | 'installed' | 'update-available' | 'installing';

export interface MarketPackage {
  id: string;
  manifest: AssetManifest;
  installState: MarketInstallState;
  installedVersion?: string;
  downloadCount?: number;
}

export interface MarketPackageVersion {
  version: string;
  releasedAt: number;
  changelog?: string;
  compatibility?: AssetCompatibility;
  downloadSize: number;
  integrity?: string;
  deprecated?: boolean;
}

// =============================================================================
// Registry API Descriptors
// =============================================================================

export interface MarketServerInfo {
  version: string;
  capabilities: string[];
}

export interface DownloadDescriptor {
  url: string;
  expiresAt: number;
  size: number;
  integrity: string;
  resumable: boolean;
}

export interface DeltaDownloadDescriptor {
  url: string;
  size: number;
  integrity: string;
  patchFormat: 'bsdiff' | 'xdelta3' | 'rsync';
  fallbackUrl?: string;
}

export interface SparseManifestResult {
  items: SparseItem[];
  totalSize: number;
}

export interface Entitlement {
  packageId: string;
  grantedAt: number;
  expiresAt?: number | null;
  source: 'free' | 'purchase' | 'subscription' | 'team' | 'gift';
  reason?: string;
}

export interface EntitlementListResult {
  entitlements: Entitlement[];
  etag: string;
}

export interface EntitlementChangesResult {
  added: Entitlement[];
  removed: string[];
  updated: Entitlement[];
  etag: string;
}

export interface EntitlementCheck {
  allowed: boolean;
  reason?: 'free' | 'purchased' | 'subscription' | 'private-access' | 'expired' | 'not-purchased';
  expiresAt?: number;
}

export interface CheckoutUrlResult {
  url: string;
  sessionId?: string;
  expiresAt: number;
}

export interface PluginBuildRequest {
  version: string;
  targetTriple: string;
  sessionId: string;
}

export interface PluginBuildWatermarkInfo {
  purchaserId: string;
  sessionId: string;
}

export interface PluginBuildReadyResult {
  url: string;
  expiresAt: number;
  integrity: string;
  watermarkInfo?: PluginBuildWatermarkInfo;
}

export interface PluginBuildQueuedResult {
  buildId: string;
  status: 'queued';
  estimatedDuration: number;
}

export type PluginBuildResponse = PluginBuildReadyResult | PluginBuildQueuedResult;

export interface PluginBuildStatusResult {
  status: 'queued' | 'building' | 'done' | 'failed';
  progress?: number;
  eta?: number;
  reason?: string;
}

export interface PluginBuildResult {
  url: string;
  expiresAt: number;
  integrity: string;
}

export interface PublisherVerificationSubmission {
  legalName: string;
  country: string;
  documentType: 'passport' | 'business-license' | 'tax-id';
  documentRef: string;
  contactEmail: string;
  publicKeyPem: string;
}

export interface PublisherVerificationSubmissionResult {
  applicationId: string;
  status: 'submitted';
  expectedReviewDays: number;
}

export interface PublisherVerificationStatus {
  status: 'pending' | 'approved' | 'rejected';
  reason?: string;
  badgeIssuedAt?: number;
}

export interface PermissionViolationAuditPayload {
  pluginId: string;
  purchaserId?: string;
  sessionId?: string;
  permission: PluginPermission;
  declared: false;
  timestamp: number;
}

export interface PermissionViolationAuditReportResult {
  delivered: boolean;
  retained: boolean;
  reason?: 'unsupported-capability' | 'transient-failure';
}

export interface FacetSchema {
  fields: Array<{
    name: string;
    kind: 'enum' | 'range' | 'set' | 'string';
    values?: string[];
    min?: number;
    max?: number;
    description?: string;
  }>;
}

export interface SemanticOntologyResult {
  schemas: Record<string, FacetSchema>;
}

export interface IntentOntologyResult {
  useCases: string[];
  workflowStage: string[];
  goals: string[];
  audience: string[];
  domain: string[];
  notFor: string[];
}

export interface DeprecationResult {
  deprecation?: AssetDeprecation;
}

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  [extension: string]: unknown;
}

// =============================================================================
// Install / Management
// =============================================================================

export type InstallPhase =
  | 'discover'
  | 'resolve'
  | 'preflight'
  | 'fetch'
  | 'verify'
  | 'stage'
  | 'activate'
  | 'record'
  | 'rollback'
  | 'done'
  | 'error';

export interface InstallProgress {
  packageId: string;
  phase: InstallPhase;
  percent: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  error?: string;
}

export interface InstallResult {
  success: boolean;
  installedPath?: string;
  manifest?: AssetManifest;
  error?: string;
  missingContributor?: MissingInstallTargetContributor;
}

export interface MissingInstallTargetContributor {
  type: AssetType;
  kind?: string;
  extensionId?: string;
  reason: 'not-declared' | 'not-installed' | 'activation-failed' | 'not-registered';
  message: string;
}

export type InstalledPackageStatus =
  'active' | 'expiring-soon' | 'expired' | 'incompatible' | 'deprecated';

export type LargeAssetInstallState =
  'not-owned' | 'owned' | 'manifest-only' | 'proxy' | 'partial' | 'full';

export interface InstalledLargeAssetState {
  state: LargeAssetInstallState;
  selectedItems?: string[];
  downloadedItems?: string[];
  selectedVariantId?: string;
  proxyQuality?: ProxyVariant['qualityTag'];
  totalSize?: number;
  downloadedSize?: number;
}

export interface InstalledPackageRefState {
  refCount: number;
  owners: string[];
}

export type WorkspaceTrustLevel = 'trusted' | 'restricted' | 'limited';

export type InstalledPackageSourceKind = 'market' | 'local' | 'local-link' | 'ai-generated';

export interface InstalledPackageSource {
  kind: InstalledPackageSourceKind;
  storageMode?: LocalAssetStorageMode;
  /** PathResolver variable path to the managed copy or external linked target. */
  path?: string;
  /** Original path is only allowed for explicit local-link flows and MUST use variable form. */
  originalPath?: string;
}

export interface InstalledPackage {
  packageId: string;
  version: string;
  type: AssetType;
  installedAt: number;
  installedPath: string;
  manifest: AssetManifest;
  source?: InstalledPackageSource;
  enabled: boolean;
  /** True when the user explicitly installed this package outside a bundle/dependency flow. */
  requested?: boolean;
  status?: InstalledPackageStatus;
  expiresAt?: number;
  graceEndsAt?: number;
  lastUsedAt?: number;
  compatibilityIssue?: { detectedAt: number; reason: string; suggestedAction?: string };
  largeAsset?: InstalledLargeAssetState;
  refs?: Record<string, InstalledPackageRefState>;
}

export interface UpdateInfo {
  packageId: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
  compatibility?: AssetCompatibility;
  blocked?: boolean;
  reason?: string;
}

export interface InstallState {
  packageId: string;
  version: string;
  manifest?: AssetManifest;
  distributionKind?: DistributionKind;
  completedPhases: InstallPhase[];
  downloaded?: DownloadDescriptor;
  stagedPath?: string;
  installedPath?: string;
  selectedItems?: string[];
  selectedVariant?: ModelVariant;
  resolvedGraph?: ResolvedInstallGraph;
}

export type InstallProgressCallback = (progress: InstallProgress) => void;

export type ResolvedInstallRelation = 'dependency' | 'bundle-content';

export interface ResolvedInstallReference {
  packageId: string;
  requestedRange: string;
  resolvedVersion?: string;
  relation: ResolvedInstallRelation;
  optional: boolean;
  reusedInstalled: boolean;
  skipped?: boolean;
  skipReason?: string;
  manifest?: AssetManifest;
}

export interface ResolvedInstallGraph {
  dependencies: ResolvedInstallReference[];
  bundleContents: ResolvedInstallReference[];
}

// =============================================================================
// Core Interfaces
// =============================================================================

export interface IMarketClient {
  search(query: MarketSearchQuery): Promise<MarketSearchResult>;
  getPackage(packageId: string): Promise<MarketPackage | undefined>;
  getVersions(packageId: string): Promise<MarketPackageVersion[]>;
  getDownloadDescriptor(packageId: string, version: string): Promise<DownloadDescriptor>;
  getFeatured(type?: AssetType): Promise<MarketPackage[]>;
  setAuthToken(token: string | null): void;
  setRegistryUrl?(registryUrl: string | null | undefined): void;
  getServerInfo(): Promise<MarketServerInfo>;
  getSparseManifest(packageId: string): Promise<SparseManifestResult>;
  reportSparseSelection(packageId: string, version: string, selectedItems: string[]): Promise<void>;
  getVariantDownloadDescriptor(packageId: string, variantId: string): Promise<DownloadDescriptor>;
  getProxyVariantDownloadDescriptor(
    packageId: string,
    qualityTag: ProxyVariant['qualityTag'],
  ): Promise<DownloadDescriptor>;
  getDeltaDownloadDescriptor(
    packageId: string,
    fromVersion: string,
    toVersion: string,
  ): Promise<DeltaDownloadDescriptor>;
  listEntitlements(): Promise<EntitlementListResult>;
  getEntitlementChanges(etag: string): Promise<EntitlementChangesResult | undefined>;
  refreshEntitlements(): Promise<EntitlementListResult>;
  checkEntitlement(packageId: string, version: string): Promise<EntitlementCheck>;
  getCheckoutUrl(packageId: string, returnTo?: string, locale?: string): Promise<CheckoutUrlResult>;
  requestPluginBuild(packageId: string, request: PluginBuildRequest): Promise<PluginBuildResponse>;
  getPluginBuildStatus(packageId: string, buildId: string): Promise<PluginBuildStatusResult>;
  getPluginBuildResult(packageId: string, buildId: string): Promise<PluginBuildResult>;
  submitPublisherVerification(
    submission: PublisherVerificationSubmission,
  ): Promise<PublisherVerificationSubmissionResult>;
  getPublisherVerificationStatus(publisherId: string): Promise<PublisherVerificationStatus>;
  reportPermissionViolation(
    payload: PermissionViolationAuditPayload,
  ): Promise<PermissionViolationAuditReportResult>;
  getSemanticOntology(type?: AssetType, kind?: string): Promise<SemanticOntologyResult>;
  getIntentOntology(): Promise<IntentOntologyResult>;
  getDeprecation(packageId: string): Promise<DeprecationResult>;
}

export interface IInstallManager {
  install(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult>;
  uninstall(packageId: string): Promise<void>;
  update(
    packageId: string,
    version: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult>;
  enable(packageId: string): Promise<void>;
  disable(packageId: string): Promise<void>;
  listInstalled(): Promise<InstalledPackage[]>;
  checkUpdates(): Promise<UpdateInfo[]>;
  ensureFull?(packageId: string, itemId?: string): Promise<InstallResult>;
  cancelInstall?(packageId: string): boolean;
}

export interface IInstallTarget<T extends AssetType = AssetType> {
  readonly type: T;
  getInstallPath(manifest: AssetManifest): string;
  validateManifest?(manifest: AssetManifest): void | Promise<void>;
  onPreInstall?(manifest: AssetManifest): Promise<void>;
  writeRegistration?(manifest: AssetManifest, installedPath: string): Promise<void>;
  onPostInstall?(manifest: AssetManifest, installedPath: string): Promise<void>;
  onPreUninstall?(manifest: AssetManifest, installedPath: string): Promise<void>;
  onRollback?(manifest: AssetManifest, partial: Partial<InstallState>): Promise<void>;
}

export interface ICacheManager {
  getCachedPath(packageId: string, version: string): Promise<string | undefined>;
  cacheFile(packageId: string, version: string, sourcePath: string): Promise<string>;
  evict(packageId: string, version?: string): Promise<void>;
  getSize(): Promise<number>;
  prune(maxSizeBytes: number): Promise<void>;
}

export interface IVersionResolver {
  satisfies(version: string, range: string): boolean;
  maxSatisfying(versions: string[], range: string): string | undefined;
  compare(a: string, b: string): -1 | 0 | 1;
  isCompatible(compatibility: AssetCompatibility | undefined, currentVersion: string): boolean;
}

export interface ILicenseManager {
  verify(
    manifest: AssetManifest,
  ): Promise<{ allowed: boolean; reason?: string; expiresAt?: number }>;
  listEntitlements?(forceRefresh?: boolean): Promise<Entitlement[]>;
  buildCheckoutUrl?(packageId: string, returnTo?: string): Promise<string>;
}

// =============================================================================
// Market Events and Persistence
// =============================================================================

export type MarketPackageEventKind =
  | 'install'
  | 'uninstall'
  | 'update'
  | 'enable'
  | 'disable'
  | 'status-change'
  | 'large-asset-state-change';

export interface MarketPackageEvent {
  kind: MarketPackageEventKind;
  packageId: string;
  manifest?: AssetManifest;
  installedPath?: string;
  type?: AssetType;
  enabled?: boolean;
  status?: InstalledPackageStatus;
  previousStatus?: InstalledPackageStatus;
  largeAsset?: InstalledLargeAssetState;
  reason?: string;
}

export interface InstalledRegistryData {
  version: number;
  packages: Record<string, InstalledPackage>;
  refs?: Record<string, InstalledPackageRefState>;
}

export interface LocalInstalledRegistryData {
  version: number;
  packages: Record<string, InstalledPackage>;
}
