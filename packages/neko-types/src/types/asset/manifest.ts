/**
 * AssetManifest v4 contract.
 *
 * This file is the portable package and local asset manifest schema.
 *
 * @see docs/architecture/manifest-schema-spec.md
 * @see docs/architecture/registry-server-contract.md
 */

// =============================================================================
// Asset Type
// =============================================================================

/** Asset implementation type used for install routing. */
export type AssetType =
  | 'media'
  | 'starter'
  | 'identity'
  | 'model'
  | 'endpoint'
  | 'provider'
  | 'profile'
  | 'skill'
  | 'processor'
  | 'plugin'
  | 'shader'
  | 'preset'
  | 'bundle';

/** UI category. This is not an install routing key. */
export type AssetCategory = 'media' | 'ai' | 'tooling' | 'bundle';

export const CATEGORY_MAP: Record<AssetType, AssetCategory> = {
  media: 'media',
  starter: 'media',
  identity: 'media',
  model: 'ai',
  endpoint: 'ai',
  provider: 'ai',
  profile: 'tooling',
  skill: 'tooling',
  processor: 'tooling',
  plugin: 'tooling',
  shader: 'tooling',
  preset: 'tooling',
  bundle: 'bundle',
};

export const ASSET_TYPES: readonly AssetType[] = [
  'media',
  'starter',
  'identity',
  'model',
  'endpoint',
  'provider',
  'profile',
  'skill',
  'processor',
  'plugin',
  'shader',
  'preset',
  'bundle',
] as const;

// =============================================================================
// Source
// =============================================================================

export type LocalAssetStorageMode = 'copy-managed' | 'local-link';

export type AssetManifestSource =
  | { kind: 'local'; path: string; storageMode?: 'copy-managed' }
  | { kind: 'local-link'; path: string; storageMode: 'local-link' }
  | { kind: 'git-lfs'; oid: string; path: string }
  | { kind: 'registry'; registry: string; package: string; version: string; integrity?: string }
  | { kind: 'ai-generated'; taskId: string; model: string }
  | { kind: 'remote'; uri: string; checksum?: string };

// =============================================================================
// Distribution Shape
// =============================================================================

export type DistributionKind = 'archive' | 'orchestration' | 'registration';

export const DISTRIBUTION_KINDS: readonly DistributionKind[] = [
  'archive',
  'orchestration',
  'registration',
] as const;

// =============================================================================
// Type-Specific Metadata
// =============================================================================

export type MediaKind =
  | 'video'
  | 'audio'
  | 'image'
  | 'sequence'
  | '3d-model'
  | 'model-2d-scene'
  | 'model-3d'
  | 'model-motion'
  | 'model-config'
  | 'live2d-model'
  | 'live2d-motion'
  | 'live2d-config'
  | 'voice-pack'
  | 'document';

export const MEDIA_KINDS: readonly MediaKind[] = [
  'video',
  'audio',
  'image',
  'sequence',
  '3d-model',
  'model-2d-scene',
  'model-3d',
  'model-motion',
  'model-config',
  'live2d-model',
  'live2d-motion',
  'live2d-config',
  'voice-pack',
  'document',
] as const;

export interface MediaMetadata {
  mediaKind: MediaKind;
  fileSize: number;
  video?: { duration: number; fps: number; codec: string; resolution: [number, number] };
  audio?: { duration: number; sampleRate: number; channels: number };
  image?: { resolution: [number, number]; hasAlpha?: boolean };
  sequence?: { frameCount: number; fps: number; resolution: [number, number] };
  '3d-model'?: {
    format: 'glb' | 'gltf' | 'fbx' | 'obj' | 'vrm' | 'mmd';
    vertexCount?: number;
  };
  'model-2d-scene'?: {
    format: 'nkm';
    profile: '2d';
    spriteCount?: number;
    tilemapCount?: number;
  };
  'model-3d'?: {
    format: 'glb' | 'gltf' | 'fbx' | 'obj' | 'vrm' | 'mmd';
    vertexCount?: number;
    rigged?: boolean;
  };
  'model-motion'?: { format: 'gltf-animation' | 'nkma' | 'vrma'; duration?: number };
  'model-config'?: { format: 'vrm-expression' | 'material-preset' | 'nkm-config' };
  'live2d-model'?: { format: 'moc3' | 'live2d-bundle'; textureCount?: number };
  'live2d-motion'?: { format: 'live2d'; duration: number };
  'live2d-config'?: { format: 'exp3' | 'physics3' | 'live2d-config' };
  'voice-pack'?: {
    format: 'wav' | 'ogg' | 'flac' | 'voice-pack';
    language?: string;
    clipCount?: number;
    hasVisemes?: boolean;
  };
  document?: {
    subtype: 'markdown' | 'pdf' | 'word' | 'pptx' | 'xlsx' | 'epub' | 'cbz' | 'fdx';
    pageCount?: number;
    wordCount?: number;
    language?: string;
    textExtractable: boolean;
  };
}

export interface StarterMetadata {
  targetEditor: 'cut' | 'canvas';
  requires?: AssetType[];
}

export interface IdentityMetadata {
  identityKind: 'character' | 'location' | 'object' | 'style';
  identityId: string;
  forms: Array<{
    role: '3d-rigged' | '2d-rigged' | 'portrait' | 'voice' | 'bio' | 'reference';
    packageRef: string;
    relPath?: string;
  }>;
}

export interface ModelMetadata {
  modelKind: 'base' | 'lora' | 'embedding';
  framework: 'onnx' | 'pytorch' | 'safetensors' | 'gguf';
  task:
    | 'image-gen'
    | 'tts'
    | 'stt'
    | 'style-transfer'
    | 'upscale'
    | 'denoise'
    | 'transcribe'
    | 'clip'
    | 'chat'
    | 'embedding'
    | 'vision'
    | string;
  size: number;
  quantization?: string;
  minVram?: number;
  architecture?: string;
  baseModel?: string;
  localValidation?: ModelLocalValidationMetadata;
}

export interface ModelLocalValidationMetadata {
  sourceWarning?: boolean;
  formatProbe?: {
    detectedFramework: ModelMetadata['framework'] | string;
    fileSize: number;
    parameterCount?: number;
    quantization?: string;
  };
  resourcePolicy?: {
    maxRamMB?: number;
    maxVramMB?: number;
    allowTrustedWorkspaceOverride?: boolean;
  };
}

export interface EndpointMetadata {
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'ollama' | 'comfyui' | 'custom';
  capabilities: ('chat' | 'image' | 'video' | 'audio' | 'embedding' | 'vision' | string)[];
  endpointTemplate: string;
  credentialSchema: {
    fields: Array<{
      name: string;
      label: string;
      kind: 'apiKey' | 'orgId' | 'baseUrl' | 'custom';
      required?: boolean;
      placeholder?: string;
    }>;
  };
  modelIds?: string[];
}

export type AssetProviderTrustLevel = 'core' | 'community' | 'untrusted';

export interface ProviderSignature {
  readonly algorithm: 'sha256' | 'sha512' | 'ed25519';
  readonly value: string;
  readonly signedBy?: string;
  readonly publicKeyId?: string;
}

export type ProviderCardSignature = ProviderSignature;

export interface ProviderMetadata {
  providerId: string;
  capabilities: ('image.generate' | 'video.generate' | 'audio.generate' | string)[];
  modelIds?: string[];
  cardSchemaVersion?: string;
  trustLevel?: AssetProviderTrustLevel;
  signature?: ProviderSignature;
}

export type ProfilePackageKind = 'artifact' | 'provider-expression';
export type ProfilePackageHost = 'vscode' | 'cli' | 'tui';

export const PROFILE_PACKAGE_KINDS: readonly ProfilePackageKind[] = [
  'artifact',
  'provider-expression',
] as const;

export const PROFILE_PACKAGE_HOSTS: readonly ProfilePackageHost[] = [
  'vscode',
  'cli',
  'tui',
] as const;

export interface ProfilePackageHostRequirement {
  readonly host: ProfilePackageHost;
  readonly optional?: boolean;
  readonly reason?: string;
}

export interface ProfilePackageEntry {
  readonly profileId: string;
  readonly kind: ProfilePackageKind;
  readonly version: string | number;
  readonly descriptorPath?: string;
  readonly displayName?: string;
}

export interface ProfilePackageMetadata {
  readonly profileKinds: readonly ProfilePackageKind[];
  readonly profiles: readonly ProfilePackageEntry[];
  readonly trustLevel?: AssetProviderTrustLevel;
  readonly signature?: ProviderSignature;
  readonly hostRequirements?: readonly ProfilePackageHostRequirement[];
}

export interface SkillMetadata {
  domain: string[];
  toolSets?: string[];
  mcpServers?: string[];
  llmRequirements?: {
    capabilities: ('vision' | 'function-calling' | 'streaming')[];
    minContextWindow?: number;
  };
}

export interface ProcessorMetadata {
  processorManifestPath: string;
  trustLevel?: Exclude<AssetProviderTrustLevel, 'core'>;
  revoked?: boolean;
}

export type PluginPermission =
  | 'fs-read:project'
  | 'fs-read:plugin-data'
  | 'fs-write:project'
  | 'fs-write:plugin-data'
  | 'network:host-list'
  | 'network:any'
  | 'gpu:render'
  | 'gpu:compute'
  | 'engine:event-bus'
  | 'engine:asset-federation'
  | 'process-spawn'
  | 'system-info';

export const PLUGIN_PERMISSIONS: readonly PluginPermission[] = [
  'fs-read:project',
  'fs-read:plugin-data',
  'fs-write:project',
  'fs-write:plugin-data',
  'network:host-list',
  'network:any',
  'gpu:render',
  'gpu:compute',
  'engine:event-bus',
  'engine:asset-federation',
  'process-spawn',
  'system-info',
] as const;

export type PluginHighSensitivePermission =
  'fs-write:project' | 'network:any' | 'process-spawn' | 'system-info';

export const PLUGIN_HIGH_SENSITIVE_PERMISSIONS: readonly PluginHighSensitivePermission[] = [
  'fs-write:project',
  'network:any',
  'process-spawn',
  'system-info',
] as const;

export interface PluginEngineRequirements {
  minVersion: string;
  targetTriple: string;
  runtimeArtifacts: ['cdylib'];
}

export interface PluginMetadata {
  entryPoint: string;
  apiVersion: string;
  permissions: PluginPermission[];
  networkHosts?: string[];
  engineRequirements: PluginEngineRequirements;
  configSchema?: Record<string, unknown>;
}

export interface ShaderInput {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'texture' | 'sampler';
  default?: number | number[];
  min?: number;
  max?: number;
  label?: string;
}

export interface ShaderMetadata {
  shaderKind: 'standalone' | 'preset';
  language: 'wgsl' | 'glsl';
  stage: 'vertex' | 'fragment' | 'compute';
  inputs: ShaderInput[];
  artifactForm?: 'wgsl-source' | 'glsl-source' | 'spirv-binary' | 'msl-binary' | 'dxil-binary';
  localValidation?: ShaderLocalValidationMetadata;
  preview?: string;
  compatibleWith?: string[];
}

export interface ShaderLocalValidationMetadata {
  validator?: 'naga' | 'spirv-val' | 'metal' | 'dxil' | 'driver';
  sourceWarning?: boolean;
  resourceLimits?: {
    maxWorkgroupSize?: number;
    maxStorageBuffers?: number;
    maxTextureBindings?: number;
    maxCompileTimeMs?: number;
  };
}

export interface PresetMetadata {
  presetKind:
    | 'lut'
    | 'transition'
    | 'effect'
    | 'export'
    | 'color'
    | 'memory'
    | 'theme'
    | 'keybinding'
    | 'convention'
    | 'audio-effect'
    | 'audio-ir'
    | string;
  targetApp?: string;
  parameters?: Record<string, unknown>;
}

export type BundleInstallPolicy = 'all' | 'pick';
export type BundleType =
  'style-pack' | 'workflow-pack' | 'character-pack' | 'motion-pack' | 'mixed';

export const BUNDLE_TYPES: readonly BundleType[] = [
  'style-pack',
  'workflow-pack',
  'character-pack',
  'motion-pack',
  'mixed',
] as const;

export interface BundleMetadata {
  installPolicy: BundleInstallPolicy;
  bundleType?: BundleType;
  recommended?: string[];
}

export type AssetTypeMetadata =
  | { type: 'media'; data: MediaMetadata }
  | { type: 'starter'; data: StarterMetadata }
  | { type: 'identity'; data: IdentityMetadata }
  | { type: 'model'; data: ModelMetadata }
  | { type: 'endpoint'; data: EndpointMetadata }
  | { type: 'provider'; data: ProviderMetadata }
  | { type: 'profile'; data: ProfilePackageMetadata }
  | { type: 'skill'; data: SkillMetadata }
  | { type: 'processor'; data: ProcessorMetadata }
  | { type: 'plugin'; data: PluginMetadata }
  | { type: 'shader'; data: ShaderMetadata }
  | { type: 'preset'; data: PresetMetadata }
  | { type: 'bundle'; data: BundleMetadata };

// =============================================================================
// Distribution Info
// =============================================================================

export interface AssetDistribution {
  license: string;
  author: string;
  tags: string[];
  description?: string;
  homepage?: string;
  downloads?: number;
  checksum: string;
  visibility?: 'public' | 'private' | 'shared' | 'paid';
  publisherId?: string;
  publisherName?: string;
  /** Deprecated compatibility field; new manifests and plugin governance use publisher.verified. */
  verified?: boolean;
  publisher?: {
    id: string;
    displayName: string;
    verified: boolean;
    verificationTier?: 'core' | 'verified';
    verifiedAt?: number;
  };
  pricing?: AssetPricing;
  rating?: { average: number; count: number };
  screenshots?: string[];
  compatibility?: AssetCompatibility;
  trustLevel?: AssetProviderTrustLevel;
  signature?: ProviderSignature;
  embeddingHash?: string;
}

export interface AssetPricing {
  model: 'free' | 'paid' | 'freemium';
  price?: number;
  currency?: string;
}

export interface AssetCompatibility {
  nekoSuiteVersion?: string;
  vscodeVersion?: string;
  engineVersion?: string;
  knownIncompatible?: { reason: string; range: string }[];
  upgradeTo?: { packageId: string; version: string };
}

// =============================================================================
// Effects, Dependencies, and Large Assets
// =============================================================================

export interface EffectsManifest {
  files?: { writes?: string[]; reads?: string[] };
  resources?: {
    vramMB?: number;
    diskMB?: number;
    ports?: number[];
  };
  registrations?: {
    tools?: string[];
    providers?: string[];
    runtimes?: ('ollama' | 'comfyui' | 'engine-onnx' | 'python' | string)[];
    effects?: string[];
    commands?: string[];
  };
  conflicts?: string[];
  network?: { hosts: string[] };
}

export interface AssetDependency {
  id: string;
  version: string;
  optional?: boolean;
}

export interface BundleContent {
  packageId: string;
  version: string;
  optional?: boolean;
  role?: string;
}

export type DistributionMode = 'eager' | 'sparse' | 'proxy' | 'delta' | 'variant';

export const DISTRIBUTION_MODES: readonly DistributionMode[] = [
  'eager',
  'sparse',
  'proxy',
  'delta',
  'variant',
] as const;

export interface LargeAssetStrategy {
  modes: DistributionMode[];
  sparseItems?: SparseItem[];
  proxyVariants?: ProxyVariant[];
  variants?: ModelVariant[];
  deltaBase?: { version: string; deltaUrl: string; deltaSize: number };
  totalSize: number;
}

export interface SparseItem {
  itemId: string;
  name: string;
  size: number;
  thumbnail?: string;
  defaultSelected?: boolean;
}

export interface ProxyVariant {
  qualityTag: 'low' | 'medium' | 'high' | 'original';
  size: number;
  resolution?: [number, number];
  bitrate?: number;
  default?: boolean;
}

export interface ModelVariant {
  variantId: string;
  size: number;
  minVram?: number;
  qualityScore?: number;
  recommended?: boolean;
}

// =============================================================================
// Semantics, Intent, Embeddings, and Curation
// =============================================================================

export type AssetSemantics =
  | { type: 'preset'; presetKind: 'lut'; data: LutSemantics }
  | { type: 'preset'; presetKind: 'transition'; data: TransitionSemantics }
  | { type: 'preset'; presetKind: 'effect'; data: EffectSemantics }
  | { type: 'preset'; presetKind: 'memory'; data: MemorySemantics }
  | { type: 'media'; mediaKind: 'audio'; data: AudioSemantics }
  | { type: 'media'; mediaKind: 'image'; data: ImageSemantics }
  | { type: 'media'; mediaKind: 'video'; data: VideoSemantics }
  | { type: 'media'; mediaKind: '3d-model'; data: ModelMediaSemantics }
  | { type: 'media'; mediaKind: 'live2d-motion'; data: Live2DMotionSemantics }
  | { type: 'identity'; data: IdentitySemantics }
  | { type: 'skill'; data: SkillSemantics }
  | { type: 'model'; data: ModelSemantics }
  | { type: 'shader'; data: ShaderSemantics }
  | { type: 'plugin'; data: { domain: string[]; useCase: string } }
  | { type: 'endpoint'; data: { latencyTier: 'low' | 'medium' | 'high'; rateLimit?: string } }
  | { type: 'provider'; data: { syntaxStyle: string[]; conceptCoverage: string[] } }
  | { type: 'profile'; data: { profileKinds: ProfilePackageKind[]; useCase: string } }
  | { type: 'starter'; data: { complexity: 1 | 2 | 3 | 4 | 5; scenario: string } }
  | { type: 'bundle'; data: { theme: string[]; collectionSize: number } };

export interface LutSemantics {
  warmth: number;
  contrast: number;
  saturation: number;
  mood: string[];
  timeOfDay?: 'golden-hour' | 'blue-hour' | 'daylight' | 'night';
  filmStock?: string;
}

export interface TransitionSemantics {
  speed: 'slow' | 'medium' | 'fast';
  style: ('cut' | 'fade' | 'slide' | 'zoom' | 'glitch' | 'morph')[];
  mood: string[];
}

export interface AudioSemantics {
  genre: string[];
  mood: string[];
  bpm?: number;
  key?: string;
  energy: number;
  loopable: boolean;
}

export interface ImageSemantics {
  artStyle: string[];
  era?: string;
  composition: ('portrait' | 'landscape' | 'closeup' | 'wide-shot')[];
  dominantColors: string[];
  hasAlpha: boolean;
}

export interface VideoSemantics {
  scene: string[];
  style: string[];
  pace: 'slow' | 'medium' | 'fast';
  duration: number;
  fps: number;
}

export interface IdentitySemantics {
  archetype: string[];
  ageGroup: 'child' | 'teen' | 'young-adult' | 'adult' | 'elder';
  personality: string[];
  artStyle: string[];
}

export interface SkillSemantics {
  domain: string[];
  useCase: string;
  outputKind: ('text' | 'image' | 'audio' | 'video' | 'plan')[];
}

export interface ModelSemantics {
  task: string[];
  architecture: string;
  trainingDomain: string[];
  language?: string[];
}

export interface ShaderSemantics {
  effectCategory: ('color' | 'distort' | 'blur' | 'sharpen' | 'stylize' | 'composite')[];
  intensity?: 'subtle' | 'moderate' | 'intense';
}

export interface EffectSemantics {
  effectKind: string[];
  intensity: number;
}

export interface MemorySemantics {
  writingStyle: string[];
  domain: string[];
}

export interface ModelMediaSemantics {
  category: 'character' | 'prop' | 'environment' | 'vehicle';
  style: string[];
  polyCount?: 'low' | 'medium' | 'high';
  rigged: boolean;
}

export interface Live2DMotionSemantics {
  emotion: string[];
  actionType: ('idle' | 'walk' | 'run' | 'gesture' | 'reaction')[];
  loopable: boolean;
}

export interface AssetIntent {
  useCases: string[];
  workflowStage?: (
    | 'pre-production'
    | 'rough-cut'
    | 'fine-cut'
    | 'color-grading'
    | 'sound-design'
    | 'finishing'
    | 'export'
    | 'storyboarding'
    | 'pre-vis'
  )[];
  goals?: (
    | 'mood-setting'
    | 'pacing'
    | 'realism'
    | 'stylization'
    | 'continuity'
    | 'transition'
    | 'emphasis'
    | 'world-building'
    | 'character-development'
  )[];
  audience?: ('beginner' | 'intermediate' | 'professional' | 'enterprise')[];
  domain?: (
    | 'film'
    | 'youtube'
    | 'tiktok'
    | 'animation'
    | 'game-dev'
    | 'broadcast'
    | 'streaming'
    | 'corporate'
    | 'education'
  )[];
  notFor?: ('commercial' | 'NSFW' | 'minor-targeted' | 'broadcast' | 'cinema' | string)[];
  description?: string;
  inspiredBy?: string[];
}

export interface SkillIntent extends AssetIntent {
  triggers: string[];
  prerequisites?: string[];
  expectedOutput: ('plan' | 'execution' | 'suggestion' | 'analysis')[];
}

export interface LutIntent extends AssetIntent {
  lookReference?: string[];
  targetGenre?: string[];
}

export interface ModelIntent extends AssetIntent {
  bestFor: string[];
  knownLimitations?: string[];
}

export interface MediaIntent extends AssetIntent {
  shotRole?: ('b-roll' | 'hero-shot' | 'establishing' | 'transition' | 'close-up' | 'wide')[];
  audioRole?: ('background' | 'foreground' | 'sfx' | 'ambient' | 'foley' | 'dialogue')[];
}

export interface StarterIntent extends AssetIntent {
  scenario: string;
  complexity: 1 | 2 | 3 | 4 | 5;
  estimatedDuration?: string;
}

export interface PackageEmbeddings {
  modelId: string;
  modelVersion: string;
  dimension: number;
  files: { path: string; vector: string }[];
}

export interface AssetDeprecation {
  since: number;
  replacedBy?: string;
  reason?: string;
  delistAt?: number;
}

// =============================================================================
// Manifest
// =============================================================================

export interface AssetManifest {
  id: string;
  name: string;
  version: string;
  type: AssetType;
  source: AssetManifestSource;
  distributionKind: DistributionKind;
  typeMetadata?: AssetTypeMetadata;
  distribution?: AssetDistribution;
  effects?: EffectsManifest;
  dependencies?: AssetDependency[];
  contents?: BundleContent[];
  largeAsset?: LargeAssetStrategy;
  semantics?: AssetSemantics;
  intent?: AssetIntent;
  embeddings?: PackageEmbeddings;
  deprecation?: AssetDeprecation;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Runtime Validation Helpers
// =============================================================================

export interface AssetManifestValidationIssue {
  field: string;
  message: string;
}

export interface AssetManifestValidationResult {
  valid: boolean;
  issues: AssetManifestValidationIssue[];
}

const ASSET_TYPE_SET = new Set<string>(ASSET_TYPES);
const MEDIA_KIND_SET = new Set<string>(MEDIA_KINDS);
const PROFILE_PACKAGE_KIND_SET = new Set<string>(PROFILE_PACKAGE_KINDS);
const PROFILE_PACKAGE_HOST_SET = new Set<string>(PROFILE_PACKAGE_HOSTS);
const BUNDLE_TYPE_SET = new Set<string>(BUNDLE_TYPES);
const DISTRIBUTION_KIND_SET = new Set<string>(DISTRIBUTION_KINDS);
const DISTRIBUTION_MODE_SET = new Set<string>(DISTRIBUTION_MODES);
const PLUGIN_PERMISSION_SET = new Set<string>(PLUGIN_PERMISSIONS);
const PLUGIN_HIGH_SENSITIVE_PERMISSION_SET = new Set<string>(PLUGIN_HIGH_SENSITIVE_PERMISSIONS);

export function isAssetType(value: unknown): value is AssetType {
  return typeof value === 'string' && ASSET_TYPE_SET.has(value);
}

export function isDistributionKind(value: unknown): value is DistributionKind {
  return typeof value === 'string' && DISTRIBUTION_KIND_SET.has(value);
}

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === 'string' && MEDIA_KIND_SET.has(value);
}

export function isProfilePackageKind(value: unknown): value is ProfilePackageKind {
  return typeof value === 'string' && PROFILE_PACKAGE_KIND_SET.has(value);
}

export function isProfilePackageHost(value: unknown): value is ProfilePackageHost {
  return typeof value === 'string' && PROFILE_PACKAGE_HOST_SET.has(value);
}

export function isBundleType(value: unknown): value is BundleType {
  return typeof value === 'string' && BUNDLE_TYPE_SET.has(value);
}

export function isPluginPermission(value: unknown): value is PluginPermission {
  return typeof value === 'string' && PLUGIN_PERMISSION_SET.has(value);
}

export function isHighSensitivePluginPermission(
  value: unknown,
): value is PluginHighSensitivePermission {
  return typeof value === 'string' && PLUGIN_HIGH_SENSITIVE_PERMISSION_SET.has(value);
}

export interface PluginPermissionDiagnostic {
  field: string;
  severity: 'error' | 'warning';
  message: string;
  permission?: PluginPermission;
}

export function validatePluginPermissionDeclarations(
  metadata: Pick<PluginMetadata, 'permissions' | 'networkHosts'>,
): PluginPermissionDiagnostic[] {
  const diagnostics: PluginPermissionDiagnostic[] = [];

  metadata.permissions.forEach((permission, index) => {
    if (!isPluginPermission(permission)) {
      diagnostics.push({
        field: `permissions.${index}`,
        severity: 'error',
        message: 'must be a known PluginPermission',
      });
      return;
    }
    if (isHighSensitivePluginPermission(permission)) {
      diagnostics.push({
        field: `permissions.${index}`,
        severity: 'warning',
        permission,
        message: highSensitivePermissionMessage(permission),
      });
    }
  });

  if (
    metadata.permissions.includes('network:host-list') &&
    !isNonEmptyArray(metadata.networkHosts)
  ) {
    diagnostics.push({
      field: 'networkHosts',
      severity: 'error',
      permission: 'network:host-list',
      message: 'required when permissions includes network:host-list',
    });
  }

  return diagnostics;
}

export function isPluginTargetTripleCompatible(
  targetTriple: string,
  currentTriple: string,
): boolean {
  return targetTriple === currentTriple;
}

export function getAssetCategory(type: AssetType): AssetCategory {
  return CATEGORY_MAP[type];
}

export function validateAssetManifest(manifest: unknown): AssetManifestValidationResult {
  const issues: AssetManifestValidationIssue[] = [];

  if (!isRecord(manifest)) {
    return { valid: false, issues: [{ field: '$', message: 'manifest must be an object' }] };
  }

  requireString(manifest, 'id', issues);
  requireString(manifest, 'name', issues);
  requireString(manifest, 'version', issues);
  requireNumber(manifest, 'createdAt', issues);
  requireNumber(manifest, 'updatedAt', issues);

  if (!isAssetType(manifest['type'])) {
    issues.push({ field: 'type', message: 'must be one of AssetType v4 values' });
  }

  if (!isDistributionKind(manifest['distributionKind'])) {
    issues.push({
      field: 'distributionKind',
      message: 'must be one of archive, orchestration, registration',
    });
  }

  if (!isRecord(manifest['source'])) {
    issues.push({ field: 'source', message: 'must be a source descriptor' });
  } else {
    validateSource(manifest['source'], issues);
  }

  if (
    isRecord(manifest['typeMetadata']) &&
    isAssetType(manifest['type']) &&
    manifest['typeMetadata']['type'] !== manifest['type']
  ) {
    issues.push({ field: 'typeMetadata.type', message: 'must match manifest type' });
  }

  if (manifest['type'] === 'bundle' && !Array.isArray(manifest['contents'])) {
    issues.push({ field: 'contents', message: 'bundle manifests must include contents' });
  }

  if (manifest['type'] === 'bundle' && manifest['distributionKind'] !== 'orchestration') {
    issues.push({ field: 'distributionKind', message: 'bundle must use orchestration' });
  }

  if (manifest['type'] === 'endpoint' && manifest['distributionKind'] !== 'registration') {
    issues.push({ field: 'distributionKind', message: 'endpoint must use registration' });
  }

  validateTypeMetadata(manifest, issues);
  validateIntent(manifest, issues);
  validateLargeAssetStrategy(manifest['largeAsset'], issues);

  return { valid: issues.length === 0, issues };
}

export function parseAssetManifest(manifest: unknown): AssetManifest {
  const result = validateAssetManifest(manifest);
  if (!result.valid) {
    const message = result.issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ');
    throw new Error(`Invalid AssetManifest: ${message}`);
  }
  return manifest as AssetManifest;
}

function validateSource(
  source: Record<string, unknown>,
  issues: AssetManifestValidationIssue[],
): void {
  const kind = source['kind'];
  if (!isNonEmptyString(kind)) {
    issues.push({ field: 'source.kind', message: 'must be a non-empty string' });
    return;
  }

  if (kind === 'registry') {
    if (!isNonEmptyString(source['integrity'])) {
      issues.push({ field: 'source.integrity', message: 'registry source must include integrity' });
    }
    return;
  }

  if (kind === 'local') {
    validateLocalSourcePath(source, issues);
    if (source['storageMode'] !== undefined && source['storageMode'] !== 'copy-managed') {
      issues.push({
        field: 'source.storageMode',
        message: 'local source storageMode must be copy-managed',
      });
    }
    return;
  }

  if (kind === 'local-link') {
    validateVariablePath(source, issues);
    if (source['storageMode'] !== 'local-link') {
      issues.push({
        field: 'source.storageMode',
        message: 'local-link source storageMode must be local-link',
      });
    }
  }
}

function validateLocalSourcePath(
  source: Record<string, unknown>,
  issues: AssetManifestValidationIssue[],
): void {
  if (!isNonEmptyString(source['path'])) {
    issues.push({ field: 'source.path', message: 'must be a non-empty string' });
    return;
  }
  if (source['storageMode'] === undefined) {
    return;
  }
  validateVariablePath(source, issues);
  if (!source['path'].startsWith('${NEKO_HOME}/local/')) {
    issues.push({
      field: 'source.path',
      message: 'copy-managed local source must point under ${NEKO_HOME}/local/',
    });
  }
}

function validateVariablePath(
  source: Record<string, unknown>,
  issues: AssetManifestValidationIssue[],
): void {
  if (!isNonEmptyString(source['path'])) {
    issues.push({ field: 'source.path', message: 'must be a non-empty string' });
    return;
  }
  if (isAbsolutePath(source['path']) || !source['path'].startsWith('${')) {
    issues.push({
      field: 'source.path',
      message: 'must use PathResolver variable form such as ${NEKO_HOME}/... or ${WORKSPACE}/...',
    });
  }
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

function validatePluginMetadataData(
  data: Record<string, unknown>,
  issues: AssetManifestValidationIssue[],
): void {
  if (!Array.isArray(data['permissions'])) return;

  data['permissions'].forEach((permission, index) => {
    if (!isPluginPermission(permission)) {
      issues.push({
        field: `typeMetadata.data.permissions.${index}`,
        message: 'must be a known PluginPermission',
      });
    }
  });

  if (data['permissions'].includes('network:host-list') && !isNonEmptyArray(data['networkHosts'])) {
    issues.push({
      field: 'typeMetadata.data.networkHosts',
      message: 'required when permissions includes network:host-list',
    });
  }

  const engineRequirements = data['engineRequirements'];
  if (!isRecord(engineRequirements)) {
    issues.push({ field: 'typeMetadata.data.engineRequirements', message: 'must be an object' });
    return;
  }

  requireString(
    engineRequirements,
    'typeMetadata.data.engineRequirements.minVersion',
    issues,
    'minVersion',
  );
  requireString(
    engineRequirements,
    'typeMetadata.data.engineRequirements.targetTriple',
    issues,
    'targetTriple',
  );

  const runtimeArtifacts = engineRequirements['runtimeArtifacts'];
  if (
    !Array.isArray(runtimeArtifacts) ||
    runtimeArtifacts.length !== 1 ||
    runtimeArtifacts[0] !== 'cdylib'
  ) {
    issues.push({
      field: 'typeMetadata.data.engineRequirements.runtimeArtifacts',
      message: 'must contain only cdylib',
    });
  }
}

function highSensitivePermissionMessage(permission: PluginHighSensitivePermission): string {
  switch (permission) {
    case 'fs-write:project':
      return 'requires prominent project modification disclosure';
    case 'network:any':
      return 'requires explicit review and prominent network warning';
    case 'process-spawn':
      return 'requires T1 publisher or documented T2 security exception';
    case 'system-info':
      return 'host API must return coarse-grained system information only';
  }
}

function validateLargeAssetStrategy(
  largeAsset: unknown,
  issues: AssetManifestValidationIssue[],
): void {
  if (largeAsset === undefined) return;
  if (!isRecord(largeAsset)) {
    issues.push({ field: 'largeAsset', message: 'must be an object' });
    return;
  }
  if (!Array.isArray(largeAsset['modes']) || largeAsset['modes'].length === 0) {
    issues.push({ field: 'largeAsset.modes', message: 'must include at least one mode' });
  }
  if (typeof largeAsset['totalSize'] !== 'number') {
    issues.push({ field: 'largeAsset.totalSize', message: 'must be a number' });
  }
  const modes = Array.isArray(largeAsset['modes']) ? largeAsset['modes'] : [];
  modes.forEach((mode, index) => {
    if (!isDistributionMode(mode)) {
      issues.push({
        field: `largeAsset.modes.${index}`,
        message: 'must be one of eager, sparse, proxy, delta, variant',
      });
    }
  });
  if (modes.includes('sparse') && !Array.isArray(largeAsset['sparseItems'])) {
    issues.push({ field: 'largeAsset.sparseItems', message: 'required for sparse mode' });
  }
  if (modes.includes('sparse') && Array.isArray(largeAsset['sparseItems'])) {
    largeAsset['sparseItems'].forEach((item, index) => {
      if (!isRecord(item)) {
        issues.push({ field: `largeAsset.sparseItems.${index}`, message: 'must be an object' });
        return;
      }
      requireString(item, `largeAsset.sparseItems.${index}.itemId`, issues, 'itemId');
      requireString(item, `largeAsset.sparseItems.${index}.name`, issues, 'name');
      requireNumber(item, `largeAsset.sparseItems.${index}.size`, issues, 'size');
    });
  }
  if (modes.includes('proxy') && !Array.isArray(largeAsset['proxyVariants'])) {
    issues.push({ field: 'largeAsset.proxyVariants', message: 'required for proxy mode' });
  }
  if (modes.includes('proxy') && Array.isArray(largeAsset['proxyVariants'])) {
    const defaultCount = largeAsset['proxyVariants'].filter(
      (variant) => isRecord(variant) && variant['default'] === true,
    ).length;
    if (defaultCount !== 1) {
      issues.push({
        field: 'largeAsset.proxyVariants',
        message: 'proxy mode requires exactly one default variant',
      });
    }
  }
  if (modes.includes('variant') && !Array.isArray(largeAsset['variants'])) {
    issues.push({ field: 'largeAsset.variants', message: 'required for variant mode' });
  }
  if (modes.includes('variant') && Array.isArray(largeAsset['variants'])) {
    const recommendedCount = largeAsset['variants'].filter(
      (variant) => isRecord(variant) && variant['recommended'] === true,
    ).length;
    if (recommendedCount !== 1) {
      issues.push({
        field: 'largeAsset.variants',
        message: 'variant mode requires exactly one recommended variant',
      });
    }
  }
  if (modes.includes('delta') && !isRecord(largeAsset['deltaBase'])) {
    issues.push({ field: 'largeAsset.deltaBase', message: 'required for delta mode' });
  }
  if (modes.includes('delta') && isRecord(largeAsset['deltaBase'])) {
    requireString(largeAsset['deltaBase'], 'largeAsset.deltaBase.version', issues, 'version');
    requireString(largeAsset['deltaBase'], 'largeAsset.deltaBase.deltaUrl', issues, 'deltaUrl');
    requireNumber(largeAsset['deltaBase'], 'largeAsset.deltaBase.deltaSize', issues, 'deltaSize');
  }
}

function validateTypeMetadata(
  manifest: Record<string, unknown>,
  issues: AssetManifestValidationIssue[],
): void {
  if (!isAssetType(manifest['type'])) return;
  if (!isRecord(manifest['typeMetadata'])) {
    issues.push({ field: 'typeMetadata', message: `required for ${manifest['type']} manifests` });
    return;
  }
  if (!isRecord(manifest['typeMetadata']['data'])) {
    issues.push({ field: 'typeMetadata.data', message: 'must be an object' });
    return;
  }

  const data = manifest['typeMetadata']['data'];
  switch (manifest['type']) {
    case 'media':
      if (!isMediaKind(data['mediaKind'])) {
        issues.push({ field: 'typeMetadata.data.mediaKind', message: 'must be a known MediaKind' });
      }
      requireNumber(data, 'typeMetadata.data.fileSize', issues, 'fileSize');
      break;
    case 'starter':
      requireString(data, 'typeMetadata.data.targetEditor', issues, 'targetEditor');
      break;
    case 'identity':
      requireString(data, 'typeMetadata.data.identityKind', issues, 'identityKind');
      requireString(data, 'typeMetadata.data.identityId', issues, 'identityId');
      requireNonEmptyArray(data, 'typeMetadata.data.forms', issues, 'forms');
      break;
    case 'model':
      requireString(data, 'typeMetadata.data.modelKind', issues, 'modelKind');
      requireString(data, 'typeMetadata.data.framework', issues, 'framework');
      requireString(data, 'typeMetadata.data.task', issues, 'task');
      requireNumber(data, 'typeMetadata.data.size', issues, 'size');
      break;
    case 'endpoint':
      requireString(data, 'typeMetadata.data.provider', issues, 'provider');
      requireNonEmptyArray(data, 'typeMetadata.data.capabilities', issues, 'capabilities');
      requireString(data, 'typeMetadata.data.endpointTemplate', issues, 'endpointTemplate');
      if (!isRecord(data['credentialSchema'])) {
        issues.push({ field: 'typeMetadata.data.credentialSchema', message: 'must be an object' });
      } else if (!Array.isArray(data['credentialSchema']['fields'])) {
        issues.push({
          field: 'typeMetadata.data.credentialSchema.fields',
          message: 'must be an array',
        });
      }
      break;
    case 'provider':
      requireString(data, 'typeMetadata.data.providerId', issues, 'providerId');
      requireNonEmptyArray(data, 'typeMetadata.data.capabilities', issues, 'capabilities');
      break;
    case 'profile':
      validateProfilePackageMetadata(data, issues);
      break;
    case 'skill':
      requireNonEmptyArray(data, 'typeMetadata.data.domain', issues, 'domain');
      break;
    case 'processor':
      requireString(
        data,
        'typeMetadata.data.processorManifestPath',
        issues,
        'processorManifestPath',
      );
      if (
        isNonEmptyString(data['processorManifestPath']) &&
        (isAbsolutePath(data['processorManifestPath']) ||
          data['processorManifestPath'].includes('..'))
      ) {
        issues.push({
          field: 'typeMetadata.data.processorManifestPath',
          message: 'must be a package-relative path',
        });
      }
      if (
        data['trustLevel'] !== undefined &&
        data['trustLevel'] !== 'community' &&
        data['trustLevel'] !== 'untrusted'
      ) {
        issues.push({
          field: 'typeMetadata.data.trustLevel',
          message: 'processor trustLevel must be community or untrusted',
        });
      }
      break;
    case 'plugin':
      requireString(data, 'typeMetadata.data.entryPoint', issues, 'entryPoint');
      requireString(data, 'typeMetadata.data.apiVersion', issues, 'apiVersion');
      requireArray(data, 'typeMetadata.data.permissions', issues, 'permissions');
      validatePluginMetadataData(data, issues);
      break;
    case 'shader':
      requireString(data, 'typeMetadata.data.shaderKind', issues, 'shaderKind');
      requireString(data, 'typeMetadata.data.language', issues, 'language');
      requireString(data, 'typeMetadata.data.stage', issues, 'stage');
      requireArray(data, 'typeMetadata.data.inputs', issues, 'inputs');
      break;
    case 'preset':
      requireString(data, 'typeMetadata.data.presetKind', issues, 'presetKind');
      break;
    case 'bundle':
      requireString(data, 'typeMetadata.data.installPolicy', issues, 'installPolicy');
      if (data['bundleType'] !== undefined && !isBundleType(data['bundleType'])) {
        issues.push({
          field: 'typeMetadata.data.bundleType',
          message: 'must be a known BundleType',
        });
      }
      break;
  }
}

function validateProfilePackageMetadata(
  data: Record<string, unknown>,
  issues: AssetManifestValidationIssue[],
): void {
  requireNonEmptyArray(data, 'typeMetadata.data.profileKinds', issues, 'profileKinds');
  if (Array.isArray(data['profileKinds'])) {
    data['profileKinds'].forEach((kind, index) => {
      if (!isProfilePackageKind(kind)) {
        issues.push({
          field: `typeMetadata.data.profileKinds.${index}`,
          message: 'must be a known profile package kind',
        });
      }
    });
  }

  requireNonEmptyArray(data, 'typeMetadata.data.profiles', issues, 'profiles');
  if (Array.isArray(data['profiles'])) {
    const declaredKinds = new Set(
      Array.isArray(data['profileKinds']) ? data['profileKinds'].filter(isProfilePackageKind) : [],
    );

    data['profiles'].forEach((profile, index) => {
      const field = `typeMetadata.data.profiles.${index}`;
      if (!isRecord(profile)) {
        issues.push({ field, message: 'must be an object' });
        return;
      }

      requireString(profile, `${field}.profileId`, issues, 'profileId');
      if (!isProfilePackageKind(profile['kind'])) {
        issues.push({ field: `${field}.kind`, message: 'must be a known profile package kind' });
      } else if (declaredKinds.size > 0 && !declaredKinds.has(profile['kind'])) {
        issues.push({
          field: `${field}.kind`,
          message: 'must be declared in profileKinds',
        });
      }

      if (!isProfilePackageVersion(profile['version'])) {
        issues.push({
          field: `${field}.version`,
          message: 'must be a non-empty string or integer',
        });
      }

      if (profile['descriptorPath'] !== undefined) {
        if (!isPackageRelativePath(profile['descriptorPath'])) {
          issues.push({
            field: `${field}.descriptorPath`,
            message: 'must be a package-relative path',
          });
        }
      }
    });
  }

  if (
    data['trustLevel'] !== undefined &&
    data['trustLevel'] !== 'core' &&
    data['trustLevel'] !== 'community' &&
    data['trustLevel'] !== 'untrusted'
  ) {
    issues.push({
      field: 'typeMetadata.data.trustLevel',
      message: 'profile trustLevel must be core, community, or untrusted',
    });
  }

  if (data['hostRequirements'] !== undefined) {
    if (!Array.isArray(data['hostRequirements'])) {
      issues.push({ field: 'typeMetadata.data.hostRequirements', message: 'must be an array' });
    } else {
      data['hostRequirements'].forEach((requirement, index) => {
        const field = `typeMetadata.data.hostRequirements.${index}`;
        if (!isRecord(requirement)) {
          issues.push({ field, message: 'must be an object' });
          return;
        }
        if (!isProfilePackageHost(requirement['host'])) {
          issues.push({ field: `${field}.host`, message: 'must be vscode, cli, or tui' });
        }
      });
    }
  }
}

function validateIntent(
  manifest: Record<string, unknown>,
  issues: AssetManifestValidationIssue[],
): void {
  if (!isRecord(manifest['intent'])) {
    issues.push({ field: 'intent', message: 'must include useCases' });
    return;
  }

  requireNonEmptyArray(manifest['intent'], 'intent.useCases', issues, 'useCases');

  const pricing =
    isRecord(manifest['distribution']) && isRecord(manifest['distribution']['pricing'])
      ? manifest['distribution']['pricing']
      : undefined;
  const model = pricing?.['model'];
  if (
    (model === 'paid' || model === 'freemium') &&
    !isNonEmptyArray(manifest['intent']['notFor'])
  ) {
    issues.push({
      field: 'intent.notFor',
      message: 'paid packages must include at least one notFor value',
    });
  }
}

function isDistributionMode(value: unknown): value is DistributionMode {
  return typeof value === 'string' && DISTRIBUTION_MODE_SET.has(value);
}

function isProfilePackageVersion(value: unknown): value is ProfilePackageEntry['version'] {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0;
  }
  return isNonEmptyString(value);
}

function isPackageRelativePath(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    !isAbsolutePath(value) &&
    !value.includes('..') &&
    !value.startsWith('\\')
  );
}

function requireString(
  record: Record<string, unknown>,
  field: string,
  issues: AssetManifestValidationIssue[],
  key = field,
): void {
  if (!isNonEmptyString(record[key])) {
    issues.push({ field, message: 'must be a non-empty string' });
  }
}

function requireNumber(
  record: Record<string, unknown>,
  field: string,
  issues: AssetManifestValidationIssue[],
  key = field,
): void {
  if (typeof record[key] !== 'number') {
    issues.push({ field, message: 'must be a number' });
  }
}

function requireArray(
  record: Record<string, unknown>,
  field: string,
  issues: AssetManifestValidationIssue[],
  key = field,
): void {
  if (!Array.isArray(record[key])) {
    issues.push({ field, message: 'must be an array' });
  }
}

function requireNonEmptyArray(
  record: Record<string, unknown>,
  field: string,
  issues: AssetManifestValidationIssue[],
  key = field,
): void {
  if (!isNonEmptyArray(record[key])) {
    issues.push({ field, message: 'must include at least one item' });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonEmptyArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length > 0;
}
