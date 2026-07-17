import {
  GALLERY_NODE_PORTS,
  MEDIA_NODE_PORTS,
  SCENE_NODE_PORTS,
  SHOT_NODE_PORTS,
} from '@neko/shared';
import type {
  CanvasBlock,
  CanvasNode,
  CanvasPreviewRole,
  ContainerCapability,
  ContainerSection,
  JsonPointerPath,
  NodePreviewDescriptor,
  PortDefinition,
} from '@neko/shared';
import { resolveResourceRefDisplayName } from './resourceDisplayName';

type WithoutNodeId<T extends CanvasNode> = T extends CanvasNode ? Omit<T, 'id'> : never;

export type CanvasNodeDraft = WithoutNodeId<CanvasNode>;

type NodePreviewDescriptorDraft = Omit<NodePreviewDescriptor, 'nodeId'>;

export interface CanvasNodePreset {
  name: string;
  nodeType: CanvasNode['type'];
  createContent: (node: CanvasNodeDraft) => ContainerSection;
  createContainer?: (node: CanvasNodeDraft) => ContainerCapability;
  createPreview?: (node: CanvasNodeDraft) => NodePreviewDescriptorDraft;
  createPorts?: (node: CanvasNodeDraft) => readonly PortDefinition[];
}

export type CanvasNodePresetRegistry = ReadonlyMap<string, CanvasNodePreset>;

const PENDING_PREVIEW_NODE_ID = '';

const BUILT_IN_CONTENT_PRESETS: CanvasNodePreset[] = [
  {
    name: 'annotation.basic',
    nodeType: 'annotation',
    createContent: () => ({
      id: 'annotation-root',
      layout: 'stack',
      blocks: [
        {
          id: 'annotation-content',
          kind: 'textarea',
          label: 'preset.annotation.note',
          binding: { path: '/content', valueType: 'string' },
        },
      ],
    }),
  },
  {
    name: 'text.basic',
    nodeType: 'text',
    createContent: () => ({
      id: 'text-root',
      layout: 'stack',
      blocks: [
        {
          id: 'text-content',
          kind: 'textarea',
          label: 'preset.text.content',
          binding: { path: '/content', valueType: 'string' },
        },
      ],
    }),
  },
  {
    name: 'shot.basic',
    nodeType: 'shot',
    createContent: () => ({
      id: 'shot-root',
      layout: 'stack',
      sections: [
        {
          id: 'shot-controls',
          title: 'preset.shot.controlsSection',
          layout: 'row',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: false,
          metadata: { defaultCollapsedSurfaces: ['overlay'] },
          blocks: [
            fieldBlock('shot-status', 'status', '/generationStatus', 'preset.shot.status'),
            selectBlock('shot-scale', '/shotScale', SHOT_SCALE_OPTIONS, 'preset.shot.scale'),
            selectBlock(
              'camera-movement',
              '/cameraMovement',
              CAMERA_MOVEMENT_OPTIONS,
              'preset.shot.cameraMovement',
            ),
            selectBlock(
              'camera-angle',
              '/cameraAngle',
              CAMERA_ANGLE_OPTIONS,
              'preset.shot.cameraAngle',
            ),
            fieldBlock('shot-duration', 'number', '/duration', 'preset.shot.duration'),
          ],
        },
        {
          id: 'shot-preview',
          layout: 'stack',
          blocks: [
            {
              id: 'shot-generated-preview',
              kind: 'asset-preview',
              label: 'preset.shot.image',
              binding: { path: '/generatedImage', valueType: 'asset' },
              metadata: {
                alternateAssetPaths: ['/runtimeReferenceImagePath', '/referenceImagePath'],
                alternateResourceRefPaths: ['/referenceImageResourceRef'],
              },
              capabilities: [
                {
                  kind: 'preview',
                  roles: ['generation-candidate'],
                  preferredRole: 'generation-candidate',
                },
                {
                  kind: 'generation-preview',
                  candidates: { path: '/generationHistory', valueType: 'array' },
                  status: { path: '/generationStatus', valueType: 'string' },
                },
              ],
            },
          ],
        },
        {
          id: 'shot-visual',
          title: 'preset.shot.visualSection',
          layout: 'stack',
          collapsible: true,
          defaultCollapsed: false,
          metadata: { defaultCollapsedSurfaces: ['overlay'] },
          blocks: [
            fieldBlock(
              'shot-visual-description',
              'textarea',
              '/visualDescription',
              'preset.shot.visual',
            ),
            fieldBlock(
              'shot-character-action',
              'textarea',
              '/characterAction',
              'preset.shot.action',
            ),
            fieldBlock('shot-emotion', 'tag-list', '/emotion', 'preset.shot.emotion'),
            fieldBlock('shot-scene-tags', 'tag-list', '/sceneTags', 'preset.shot.tags'),
            fieldBlock('shot-visual-style', 'input', '/visualStyle', 'preset.shot.visualStyle'),
            fieldBlock('shot-vfx', 'tag-list', '/vfx', 'preset.shot.vfx'),
          ],
        },
        {
          id: 'shot-characters-section',
          title: 'preset.shot.charactersSection',
          layout: 'stack',
          collapsible: true,
          defaultCollapsed: false,
          metadata: { defaultCollapsedSurfaces: ['overlay'] },
          blocks: [
            readonlyCollectionBlock(
              'shot-characters',
              '/characters',
              'preset.shot.characters',
              'preset.shot.noCharacters',
              '/characterId',
              '/characterName',
              [
                readonlyItemField('shot-character-role', 'input', '/role', 'preset.shot.role'),
                readonlyItemField(
                  'shot-character-action',
                  'textarea',
                  '/action',
                  'preset.shot.action',
                ),
                readonlyItemField(
                  'shot-character-emotion',
                  'input',
                  '/emotion',
                  'preset.shot.emotion',
                ),
                readonlyItemField(
                  'shot-character-entity',
                  'input',
                  '/entityRef/entityId',
                  'preset.shot.entity',
                ),
                readonlyItemField(
                  'shot-character-appearance',
                  'textarea',
                  '/appearanceNotes',
                  'preset.shot.appearance',
                ),
                readonlyItemField(
                  'shot-character-continuity',
                  'textarea',
                  '/continuityNotes',
                  'preset.shot.continuity',
                ),
              ],
            ),
          ],
        },
        {
          id: 'shot-text-cues-section',
          title: 'preset.shot.textCuesSection',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: false,
          metadata: { defaultCollapsedSurfaces: ['overlay'] },
          blocks: [
            readonlyCollectionBlock(
              'shot-text-cues',
              '/textCues',
              'preset.shot.textCues',
              'preset.shot.noTextCues',
              '/cueId',
              '/text',
              [
                readonlyItemField('shot-text-cue-kind', 'input', '/kind', 'preset.shot.cueKind'),
                readonlyItemField(
                  'shot-text-cue-speaker',
                  'input',
                  '/speakerName',
                  'preset.shot.speaker',
                ),
                readonlyItemField(
                  'shot-text-cue-speaker-id',
                  'input',
                  '/speakerCharacterId',
                  'preset.shot.speakerCharacterId',
                ),
                readonlyItemField(
                  'shot-text-cue-speaker-entity',
                  'input',
                  '/speakerEntityRef/entityId',
                  'preset.shot.entity',
                ),
                readonlyItemField(
                  'shot-text-cue-emotion',
                  'input',
                  '/emotion',
                  'preset.shot.emotion',
                ),
                readonlyItemField(
                  'shot-text-cue-delivery',
                  'input',
                  '/delivery',
                  'preset.shot.delivery',
                ),
                readonlyItemField(
                  'shot-text-cue-confidence',
                  'number',
                  '/confidence',
                  'preset.shot.confidence',
                ),
                readonlyItemField(
                  'shot-text-cue-source',
                  'input',
                  '/sourceRefId',
                  'preset.shot.sourceRef',
                ),
              ],
            ),
          ],
        },
        {
          id: 'shot-voice-cues-section',
          title: 'preset.shot.voiceCuesSection',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: false,
          metadata: { defaultCollapsedSurfaces: ['overlay'] },
          blocks: [
            readonlyCollectionBlock(
              'shot-voice-cues',
              '/voiceCues',
              'preset.shot.voiceCues',
              'preset.shot.noVoiceCues',
              '/cueId',
              '/text',
              [
                readonlyItemField('shot-voice-cue-kind', 'input', '/kind', 'preset.shot.cueKind'),
                readonlyItemField(
                  'shot-voice-cue-speaker',
                  'input',
                  '/speakerName',
                  'preset.shot.speaker',
                ),
                readonlyItemField(
                  'shot-voice-cue-speaker-id',
                  'input',
                  '/speakerCharacterId',
                  'preset.shot.speakerCharacterId',
                ),
                readonlyItemField(
                  'shot-voice-cue-speaker-entity',
                  'input',
                  '/speakerEntityRef/entityId',
                  'preset.shot.entity',
                ),
                readonlyItemField(
                  'shot-voice-cue-emotion',
                  'input',
                  '/emotion',
                  'preset.shot.emotion',
                ),
                readonlyItemField(
                  'shot-voice-cue-delivery',
                  'input',
                  '/delivery',
                  'preset.shot.delivery',
                ),
                readonlyItemField(
                  'shot-voice-cue-voice-asset',
                  'input',
                  '/voiceAssetId',
                  'preset.shot.voiceAsset',
                ),
                readonlyItemField(
                  'shot-voice-cue-source',
                  'input',
                  '/sourceRefId',
                  'preset.shot.sourceRef',
                ),
              ],
            ),
          ],
        },
        {
          id: 'shot-audio',
          title: 'preset.shot.audioSection',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: false,
          metadata: { defaultCollapsedSurfaces: ['overlay'] },
          blocks: [
            fieldBlock('shot-dialogue', 'textarea', '/dialogue', 'preset.shot.dialogue'),
            fieldBlock('shot-voice-over', 'textarea', '/voiceOver', 'preset.shot.voiceOver'),
            fieldBlock('shot-sound-cue', 'input', '/soundCue', 'preset.shot.sound'),
          ],
        },
        {
          id: 'shot-generation',
          title: 'preset.shot.generationSection',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: true,
          blocks: [
            readonlyFieldBlock(
              'shot-generated-video-prompt',
              'textarea',
              '/generatedVideoAsset/prompt',
              'preset.shot.videoPrompt',
            ),
            readonlyFieldBlock(
              'shot-generated-image-prompt',
              'textarea',
              '/generatedAsset/prompt',
              'preset.shot.imagePrompt',
            ),
          ],
        },
        {
          id: 'shot-image-prep',
          title: 'preset.shot.imagePrepSection',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: true,
          blocks: [
            readonlyFieldBlock(
              'shot-image-prep-status',
              'input',
              '/shotImagePrepPlan/status',
              'preset.shot.imagePrepStatus',
            ),
            readonlyFieldBlock(
              'shot-image-prep-strategy',
              'input',
              '/shotImagePrepPlan/imageStrategy',
              'preset.shot.imagePrepStrategy',
            ),
            readonlyFieldBlock(
              'shot-image-prep-regeneration-recommendation',
              'input',
              '/shotImagePrepPlan/metadata/regenerationRecommendation/label',
              'preset.shot.regenerationRecommendation',
            ),
            readonlyFieldBlock(
              'shot-image-prep-edit',
              'textarea',
              '/shotImagePrepPlan/editInstruction',
              'preset.shot.editInstruction',
            ),
            readonlyFieldBlock(
              'shot-image-prep-generation-prompt',
              'textarea',
              '/shotImagePrepPlan/generationPrompt',
              'preset.shot.generationPrompt',
            ),
            readonlyFieldBlock(
              'shot-image-prep-operations',
              'input',
              '/shotImagePrepPlan/operationPlan',
              'preset.shot.operationPlan',
            ),
            readonlyCollectionBlock(
              'shot-image-prep-source-refs',
              '/shotImagePrepPlan/sourceMediaRefs',
              'preset.shot.sourceMediaRefs',
              'preset.shot.noSourceMediaRefs',
              '/refId',
              '/label',
              STORYBOARD_MEDIA_REF_ITEM_BLOCKS,
            ),
            readonlyCollectionBlock(
              'shot-image-prep-mask-refs',
              '/shotImagePrepPlan/maskRefs',
              'preset.shot.maskRefs',
              'preset.shot.noMaskRefs',
              '/refId',
              '/label',
              STORYBOARD_MEDIA_REF_ITEM_BLOCKS,
            ),
            readonlyCollectionBlock(
              'shot-image-prep-output-refs',
              '/shotImagePrepPlan/outputMediaRefs',
              'preset.shot.outputMediaRefs',
              'preset.shot.noOutputMediaRefs',
              '/refId',
              '/label',
              STORYBOARD_MEDIA_REF_ITEM_BLOCKS,
            ),
            readonlyCollectionBlock(
              'shot-image-prep-character-refs',
              '/shotImagePrepPlan/referenceBundle/characterRefs',
              'preset.shot.characterRefs',
              'preset.shot.noCharacterRefs',
              '/entityRef/entityId',
              '/entityRef/entityId',
              [
                readonlyItemField(
                  'shot-image-prep-character-role',
                  'input',
                  '/role',
                  'preset.shot.role',
                ),
                readonlyItemField(
                  'shot-image-prep-character-entity',
                  'input',
                  '/entityRef/entityId',
                  'preset.shot.entity',
                ),
                readonlyItemField(
                  'shot-image-prep-character-confidence',
                  'number',
                  '/confidence',
                  'preset.shot.confidence',
                ),
              ],
            ),
            readonlyCollectionBlock(
              'shot-image-prep-diagnostics',
              '/shotImagePrepPlan/diagnostics',
              'preset.shot.diagnostics',
              'preset.shot.noDiagnostics',
              '/code',
              '/message',
              [
                readonlyItemField(
                  'shot-image-prep-diagnostic-severity',
                  'input',
                  '/severity',
                  'preset.shot.severity',
                ),
                readonlyItemField(
                  'shot-image-prep-diagnostic-code',
                  'input',
                  '/code',
                  'preset.shot.code',
                ),
                readonlyItemField(
                  'shot-image-prep-diagnostic-message',
                  'textarea',
                  '/message',
                  'preset.shot.message',
                ),
              ],
            ),
            actionBlock('shot-image-prep-approve', 'approve-shot-prep', 'preset.shot.approvePrep'),
            actionBlock('shot-image-prep-skip', 'reject-shot-prep', 'preset.shot.skipPrep'),
            actionBlock(
              'shot-image-prep-estimate',
              'estimate-batch-cost',
              'preset.shot.estimatePrep',
            ),
            actionBlock('shot-image-prep-run', 'run-shot-prep', 'preset.shot.runPrep'),
            actionBlock(
              'shot-image-prep-run-batch',
              'run-approved-shot-prep-batch',
              'preset.shot.runPrepBatch',
            ),
          ],
        },
        {
          id: 'shot-indexing-review',
          title: 'preset.shot.indexingReviewSection',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: true,
          blocks: [
            readonlyCollectionBlock(
              'shot-visual-occurrences',
              '/visualOccurrences',
              'preset.shot.visualOccurrences',
              'preset.shot.noVisualOccurrences',
              '/occurrenceId',
              '/appearanceText',
              [
                readonlyItemField(
                  'shot-visual-occurrence-candidate',
                  'input',
                  '/candidateEntityRefs/0/entityId',
                  'preset.shot.entity',
                ),
                readonlyItemField(
                  'shot-visual-occurrence-confidence',
                  'number',
                  '/confidence',
                  'preset.shot.confidence',
                ),
                readonlyItemField(
                  'shot-visual-occurrence-review-state',
                  'input',
                  '/reviewState',
                  'preset.shot.reviewState',
                ),
                readonlyItemField(
                  'shot-visual-occurrence-appearance',
                  'textarea',
                  '/appearanceText',
                  'preset.shot.appearance',
                ),
                readonlyItemField(
                  'shot-visual-occurrence-source-range',
                  'input',
                  '/sourceRangeRef/rangeId',
                  'preset.shot.sourceRef',
                ),
                readonlyItemField(
                  'shot-visual-occurrence-provider',
                  'input',
                  '/providerId',
                  'preset.shot.provider',
                ),
              ],
            ),
            readonlyCollectionBlock(
              'shot-character-candidates',
              '/characterCandidates',
              'preset.shot.characterCandidates',
              'preset.shot.noCharacterCandidates',
              '/candidateId',
              '/displayName',
              [
                readonlyItemField(
                  'shot-character-candidate-entity',
                  'input',
                  '/entityRef/entityId',
                  'preset.shot.entity',
                ),
                readonlyItemField(
                  'shot-character-candidate-role',
                  'input',
                  '/role',
                  'preset.shot.role',
                ),
                readonlyItemField(
                  'shot-character-candidate-confidence',
                  'number',
                  '/confidence',
                  'preset.shot.confidence',
                ),
                readonlyItemField(
                  'shot-character-candidate-source',
                  'input',
                  '/sourceRefId',
                  'preset.shot.sourceRef',
                ),
              ],
            ),
            readonlyCollectionBlock(
              'shot-continuity-diagnostics',
              '/continuityDiagnostics',
              'preset.shot.continuityDiagnostics',
              'preset.shot.noContinuityDiagnostics',
              '/code',
              '/message',
              [
                readonlyItemField(
                  'shot-continuity-diagnostic-severity',
                  'input',
                  '/severity',
                  'preset.shot.severity',
                ),
                readonlyItemField(
                  'shot-continuity-diagnostic-code',
                  'input',
                  '/code',
                  'preset.shot.code',
                ),
                readonlyItemField(
                  'shot-continuity-diagnostic-message',
                  'textarea',
                  '/message',
                  'preset.shot.message',
                ),
              ],
            ),
            readonlyFieldBlock(
              'shot-batch-plan-status',
              'input',
              '/batchExecutionPlan/status',
              'preset.shot.batchStatus',
            ),
            readonlyFieldBlock(
              'shot-batch-plan-domain',
              'input',
              '/batchExecutionPlan/targetDomain',
              'preset.shot.batchDomain',
            ),
            readonlyFieldBlock(
              'shot-batch-plan-cost',
              'number',
              '/batchExecutionPlan/costEstimate/estimatedCost',
              'preset.shot.batchEstimatedCost',
            ),
            readonlyCollectionBlock(
              'shot-batch-plan-items',
              '/batchExecutionPlan/items',
              'preset.shot.batchItems',
              'preset.shot.noBatchItems',
              '/itemId',
              '/capabilityId',
              [
                readonlyItemField(
                  'shot-batch-item-provider',
                  'input',
                  '/providerId',
                  'preset.shot.provider',
                ),
                readonlyItemField(
                  'shot-batch-item-status',
                  'input',
                  '/status',
                  'preset.shot.status',
                ),
                readonlyItemField(
                  'shot-batch-item-cost',
                  'number',
                  '/costEstimate/estimatedCost',
                  'preset.shot.batchEstimatedCost',
                ),
              ],
            ),
            readonlyCollectionBlock(
              'shot-batch-plan-diagnostics',
              '/batchExecutionPlan/diagnostics',
              'preset.shot.batchDiagnostics',
              'preset.shot.noBatchDiagnostics',
              '/code',
              '/message',
              [
                readonlyItemField(
                  'shot-batch-diagnostic-severity',
                  'input',
                  '/severity',
                  'preset.shot.severity',
                ),
                readonlyItemField(
                  'shot-batch-diagnostic-code',
                  'input',
                  '/code',
                  'preset.shot.code',
                ),
                readonlyItemField(
                  'shot-batch-diagnostic-message',
                  'textarea',
                  '/message',
                  'preset.shot.message',
                ),
              ],
            ),
          ],
        },
        {
          id: 'shot-media',
          title: 'preset.shot.mediaSection',
          layout: 'stack',
          visibleWhen: 'selected',
          collapsible: true,
          defaultCollapsed: true,
          blocks: [
            readonlyCollectionBlock(
              'shot-source-media-refs',
              '/sourceMediaRefs',
              'preset.shot.sourceMediaRefs',
              'preset.shot.noSourceMediaRefs',
              '/refId',
              '/label',
              STORYBOARD_MEDIA_REF_ITEM_BLOCKS,
            ),
            readonlyCollectionBlock(
              'shot-generated-media-refs',
              '/generatedMediaRefs',
              'preset.shot.generatedMediaRefs',
              'preset.shot.noGeneratedMediaRefs',
              '/refId',
              '/label',
              STORYBOARD_MEDIA_REF_ITEM_BLOCKS,
            ),
          ],
        },
      ],
    }),
    createPreview: (node) => {
      const data = node.type === 'shot' ? node.data : undefined;
      const selected = data?.generationHistory.find((candidate) => candidate.selected);
      return {
        title: data ? `Shot ${data.shotNumber}` : 'Shot',
        subtitle: data?.visualDescription,
        role: 'generation-candidate',
        thumbnailVariantId: selected?.id,
        metadata: selected
          ? {
              selectedAssetId: selected.assetId,
            }
          : undefined,
        badges: data?.generationStatus
          ? [{ label: data.generationStatus, tone: 'neutral' }]
          : undefined,
        capabilities: [
          {
            kind: 'generation-preview',
            candidates: { path: '/generationHistory', valueType: 'array' },
            status: { path: '/generationStatus', valueType: 'string' },
          },
        ],
      };
    },
    createPorts: () => SHOT_NODE_PORTS,
  },
  {
    name: 'scene.basic',
    nodeType: 'scene',
    createContent: () => ({
      id: 'scene-root',
      layout: 'stack',
      sections: [
        {
          id: 'scene-header',
          layout: 'row',
          blocks: [
            fieldBlock('scene-number', 'number', '/sceneNumber', 'preset.scene.number'),
            fieldBlock('scene-title', 'input', '/sceneTitle', 'preset.scene.title'),
            fieldBlock('scene-location', 'input', '/location', 'preset.scene.location'),
            fieldBlock('scene-time-of-day', 'input', '/timeOfDay', 'preset.scene.time'),
          ],
        },
      ],
      childSlots: [
        {
          id: 'scene-children',
          layout: 'grid',
          summaryRole: 'node-summary',
          filter: { nodeTypes: ['shot'] },
          emptyLabel: 'preset.scene.noChildren',
        },
      ],
    }),
    createContainer: () => ({
      policy: 'scene',
      childIds: [],
      layout: { mode: 'sequence' },
      acceptedChildren: {
        nodeTypes: ['shot'],
      },
      deleteBehavior: 'release-children',
    }),
    createPreview: (node) => {
      const data = node.type === 'scene' ? node.data : undefined;
      return {
        title: data?.sceneTitle ?? 'Scene',
        subtitle: joinLabelParts([data?.location, data?.timeOfDay]),
        role: 'node-summary',
        badges: data
          ? [{ label: `${getDraftContainerChildIds(node).length} shots`, tone: 'info' }]
          : undefined,
      };
    },
    createPorts: () => SCENE_NODE_PORTS,
  },
  {
    name: 'gallery.basic',
    nodeType: 'gallery',
    createContent: () => ({
      id: 'gallery-root',
      layout: 'stack',
      sections: [
        {
          id: 'gallery-header',
          layout: 'row',
          blocks: [
            selectBlock(
              'gallery-preset',
              '/preset',
              GALLERY_PRESET_OPTIONS,
              'preset.gallery.preset',
            ),
            fieldBlock(
              'gallery-character-name',
              'input',
              '/characterName',
              'preset.gallery.character',
            ),
          ],
        },
        {
          id: 'gallery-prompt',
          layout: 'stack',
          visibleWhen: 'expanded',
          collapsible: true,
          defaultCollapsed: true,
          title: 'preset.gallery.advanced',
          blocks: [
            fieldBlock(
              'gallery-global-prompt',
              'textarea',
              '/globalPromptPrefix',
              'preset.gallery.promptPrefix',
            ),
          ],
        },
        {
          id: 'gallery-profile',
          layout: 'stack',
          visibleWhen: 'expanded',
          collapsible: true,
          defaultCollapsed: true,
          title: 'preset.gallery.characterProfile',
          blocks: [
            fieldBlock(
              'gallery-profile-desc',
              'textarea',
              '/characterProfile/description',
              'preset.gallery.profileDescription',
            ),
            fieldBlock(
              'gallery-profile-tags',
              'tag-list',
              '/characterProfile/tags',
              'preset.gallery.profileTags',
            ),
            fieldBlock(
              'gallery-profile-ref',
              'input',
              '/characterProfile/referenceAssetId',
              'preset.gallery.profileReference',
            ),
          ],
        },
        {
          id: 'gallery-content',
          layout: 'stack',
          childSlots: [
            {
              id: 'gallery-children',
              layout: 'gallery',
              summaryRole: 'generation-candidate',
              emptyLabel: 'preset.gallery.noCells',
            },
          ],
        },
      ],
    }),
    createContainer: () => ({
      policy: 'gallery' as const,
      childIds: [],
      layout: { mode: 'gallery' as const },
      acceptedChildren: { nodeTypes: ['media'] },
      deleteBehavior: 'delete-subtree' as const,
    }),
    createPreview: (node) => {
      const data = node.type === 'gallery' ? node.data : undefined;
      const childCount = getDraftContainerChildIds(node).length;
      return {
        title: data?.characterName ?? 'Gallery',
        subtitle: data?.preset,
        role: 'collection',
        badges: [{ label: `${childCount} cells`, tone: 'info' as const }],
      };
    },
    createPorts: () => GALLERY_NODE_PORTS,
  },
  {
    name: 'group.container',
    nodeType: 'group',
    createContent: () => ({
      id: 'group-root',
      layout: 'stack',
      sections: [
        {
          id: 'group-header',
          layout: 'row',
          blocks: [fieldBlock('group-label', 'input', '/label', 'preset.group.label')],
        },
      ],
      childSlots: [
        {
          id: 'group-children',
          layout: 'grid',
          summaryRole: 'node-summary',
          emptyLabel: 'group.empty',
        },
      ],
    }),
    createContainer: () => ({
      policy: 'group',
      childIds: [],
      layout: { mode: 'manual' },
      acceptedChildren: {
        nodeTypes: ['shot', 'media', 'annotation', 'text', 'gallery', 'scene', 'group'],
      },
      deleteBehavior: 'release-children',
    }),
    createPreview: (node) => {
      const data = node.type === 'group' ? node.data : undefined;
      const childCount = getDraftContainerChildIds(node).length;
      return {
        title: data?.label ?? 'Group',
        role: 'node-summary',
        badges: [{ label: `${childCount}`, tone: 'info' as const }],
      };
    },
  },
  {
    name: 'media.basic',
    nodeType: 'media',
    createContent: (node) => {
      const role = getMediaPreviewRole(node);
      const assetBindingPath = getMediaRuntimeBindingPath(node);
      return {
        id: 'media-root',
        layout: 'stack',
        sections: [
          {
            id: 'media-preview',
            layout: 'stack',
            blocks: [
              {
                id: 'media-asset-preview',
                kind: 'asset-preview',
                label: 'preset.media.preview',
                binding: {
                  path: assetBindingPath,
                  valueType: 'asset',
                },
                metadata: {
                  alternateResourceRefPaths: ['/documentResourceRef', '/resourceRef'],
                },
                capabilities: [
                  {
                    kind: 'preview',
                    roles: [role],
                    preferredRole: role,
                  },
                  {
                    kind: 'asset-identity',
                    mediaType: node.type === 'media' ? node.data.mediaType : undefined,
                  },
                  {
                    kind: 'delegate',
                    actions: [
                      {
                        id: 'open-media',
                        label: 'preview.open',
                        target: 'preview',
                        assetBinding: {
                          path: assetBindingPath,
                          valueType: 'asset',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };
    },
    createPreview: (node) => {
      const data = node.type === 'media' ? node.data : undefined;
      const persistentPath = data?.assetPath || data?.documentResourceRef?.entryPath;
      const resourceTitle = data?.resourceRef
        ? resolveResourceRefDisplayName(data.resourceRef)
        : undefined;
      const resourceMetadata =
        data?.documentResourceRef || data?.resourceRef
          ? {
              ...(data.documentResourceRef
                ? { documentResourceRef: data.documentResourceRef }
                : {}),
              ...(data.resourceRef ? { resourceRef: data.resourceRef } : {}),
            }
          : undefined;
      return {
        title:
          resourceTitle ?? extractBasename(persistentPath || data?.runtimeAssetPath) ?? 'Media',
        subtitle: data?.mediaType,
        role: getMediaPreviewRole(node),
        thumbnailVariantId: data?.thumbnailPath,
        capabilities: [
          {
            kind: 'asset-identity',
            path: data?.assetPath || undefined,
            mediaType: data?.mediaType,
          },
          {
            kind: 'preview',
            roles: [getMediaPreviewRole(node)],
            preferredRole: getMediaPreviewRole(node),
          },
        ],
        metadata: resourceMetadata,
      };
    },
    createPorts: () => MEDIA_NODE_PORTS,
  },
  {
    name: 'table.basic',
    nodeType: 'table',
    createContent: (node) => ({
      id: 'table-root',
      layout: 'stack',
      sections: [
        {
          id: 'table-header',
          layout: 'row',
          blocks: [
            fieldBlock('table-label', 'input', '/label', 'preset.table.label'),
            fieldBlock('table-columns', 'number', '/columnCount', 'preset.table.columns'),
            fieldBlock('table-rows', 'number', '/rowCount', 'preset.table.rows'),
          ],
        },
        ...(hasMarkdownReviewRows(node)
          ? [
              {
                id: 'table-markdown-review',
                title: 'preset.table.markdownReview',
                layout: 'stack' as const,
                blocks: [markdownReviewTableBlock('table-markdown-rows', '/markdown')],
              },
            ]
          : []),
      ],
      childSlots: [
        {
          id: 'table-children',
          layout: 'table',
          summaryRole: 'node-summary',
          emptyLabel: 'preset.table.noChildren',
        },
      ],
    }),
    createContainer: () => ({
      policy: 'table',
      childIds: [],
      layout: {
        mode: 'table',
        columns: 3,
        columnWidth: 200,
        rowHeight: 120,
      },
      deleteBehavior: 'release-children',
    }),
    createPreview: (node) => {
      const data = node.type === 'table' ? node.data : undefined;
      return {
        title: data?.label ?? 'Table',
        role: 'node-summary',
        badges: data
          ? [{ label: `${data.columnCount}×${data.rowCount}`, tone: 'info' }]
          : undefined,
      };
    },
  },
  {
    name: 'project.basic',
    nodeType: 'project',
    createContent: () => ({
      id: 'project-root',
      layout: 'stack' as const,
      sections: [
        {
          id: 'project-preview',
          layout: 'stack' as const,
          blocks: [
            {
              id: 'project-asset-preview',
              kind: 'asset-preview' as const,
              label: 'preset.project.preview',
              binding: { path: '/projectPath' as JsonPointerPath, valueType: 'asset' as const },
              capabilities: [
                {
                  kind: 'preview' as const,
                  roles: ['project-thumbnail'] as CanvasPreviewRole[],
                  preferredRole: 'project-thumbnail' as const,
                },
                {
                  kind: 'delegate' as const,
                  actions: [
                    {
                      id: 'open-project',
                      label: 'preview.open',
                      target: 'project',
                      assetBinding: {
                        path: '/projectPath' as JsonPointerPath,
                        valueType: 'asset' as const,
                      },
                    },
                  ],
                },
              ],
            } satisfies CanvasBlock,
          ],
        },
      ],
    }),
    createPreview: (node) => {
      const data = node.type === 'project' ? node.data : undefined;
      return {
        title: data?.projectTitle || extractBasename(data?.projectPath),
        subtitle: data?.projectType,
        role: 'project-thumbnail' as const,
        thumbnailVariantId: data?.thumbnailData ? 'thumb' : undefined,
        capabilities: [
          {
            kind: 'preview' as const,
            roles: ['project-thumbnail'] as CanvasPreviewRole[],
            preferredRole: 'project-thumbnail' as const,
          },
        ],
      };
    },
  },
];

export function createBuiltInCanvasNodePresetRegistry(): CanvasNodePresetRegistry {
  return new Map(BUILT_IN_CONTENT_PRESETS.map((preset) => [preset.name, preset]));
}

const BUILT_IN_CANVAS_NODE_PRESET_REGISTRY = createBuiltInCanvasNodePresetRegistry();

export function getCanvasNodePreset(
  registry: CanvasNodePresetRegistry,
  name: string | undefined,
): CanvasNodePreset | undefined {
  return name ? registry.get(name) : undefined;
}

export function applyCanvasNodePreset(
  node: CanvasNodeDraft,
  preset: CanvasNodePreset | undefined,
): CanvasNodeDraft {
  if (!preset || node.type !== preset.nodeType) {
    return node;
  }

  const ports = preset.createPorts?.(node);
  const preview = preset.createPreview?.(node);

  return {
    ...node,
    preset: preset.name,
    content: preset.createContent(node),
    container: preset.createContainer?.(node),
    preview: preview ? { nodeId: PENDING_PREVIEW_NODE_ID, ...preview } : node.preview,
    ports: ports ? [...ports] : node.ports,
  } as CanvasNodeDraft;
}

export function hydrateCanvasNodePreview(node: CanvasNode): CanvasNode {
  return refreshCanvasNodePreview(node);
}

export function refreshCanvasNodePreview(node: CanvasNode): CanvasNode {
  const preset = getCanvasNodePreset(BUILT_IN_CANVAS_NODE_PRESET_REGISTRY, node.preset);
  if (!preset?.createPreview) {
    if (!node.preview || node.preview.nodeId === node.id) {
      return node;
    }

    return {
      ...node,
      preview: {
        ...node.preview,
        nodeId: node.id,
      },
    } as CanvasNode;
  }

  const preview = preset.createPreview(node as CanvasNodeDraft);
  const nextPreview = {
    nodeId: node.id,
    ...preview,
  };

  if (arePreviewDescriptorsEqual(node.preview, nextPreview)) {
    return node;
  }

  return {
    ...node,
    preview: nextPreview,
  } as CanvasNode;
}

function fieldBlock(
  id: string,
  kind: CanvasBlock['kind'],
  path: JsonPointerPath,
  label: string,
): CanvasBlock {
  return {
    id,
    kind,
    label,
    binding: { path, valueType: kind === 'number' ? 'number' : 'string' },
  };
}

function readonlyFieldBlock(
  id: string,
  kind: CanvasBlock['kind'],
  path: JsonPointerPath,
  label: string,
): CanvasBlock {
  return {
    id,
    kind,
    label,
    binding: { path, valueType: kind === 'number' ? 'number' : 'string', mode: 'read' },
  };
}

function markdownReviewTableBlock(id: string, path: JsonPointerPath): CanvasBlock {
  return {
    id,
    kind: 'custom',
    label: 'preset.table.markdownRows',
    binding: { path, valueType: 'object', mode: 'read' },
    metadata: {
      presentation: 'markdown-review-table',
      emptyLabel: 'preset.table.noMarkdownRows',
    },
  };
}

function actionBlock(id: string, action: string, label: string): CanvasBlock {
  return {
    id,
    kind: 'button',
    label,
    metadata: {
      action,
      disabledReasonPath: '/shotImagePrepPlan/diagnostics',
      requiresCapability:
        action === 'run-shot-prep' || action === 'estimate-batch-cost'
          ? 'image-prep-pipeline'
          : 'shot-image-prep.review',
    },
  };
}

function readonlyCollectionBlock(
  id: string,
  sourcePath: JsonPointerPath,
  label: string,
  emptyLabel: string,
  itemKeyPath: JsonPointerPath,
  itemLabelPath: JsonPointerPath,
  itemBlocks: readonly CanvasBlock[],
): CanvasBlock {
  return {
    id,
    kind: 'collection',
    label,
    collection: {
      id,
      source: { path: sourcePath, valueType: 'array', mode: 'read' },
      itemKeyPath,
      itemLabelPath,
      emptyLabel,
      itemBlocks: [...itemBlocks],
    },
    metadata: {
      readOnlyCollection: true,
    },
  };
}

function readonlyItemField(
  id: string,
  kind: CanvasBlock['kind'],
  path: JsonPointerPath,
  label: string,
): CanvasBlock {
  return {
    id,
    kind,
    label,
    binding: { path, valueType: kind === 'number' ? 'number' : 'string', mode: 'read' },
    metadata: kind === 'textarea' ? { multiline: true } : undefined,
  };
}

function selectBlock(
  id: string,
  path: JsonPointerPath,
  options: readonly string[],
  label: string,
): CanvasBlock {
  return {
    id,
    kind: 'select',
    label,
    binding: { path, valueType: 'string' },
    metadata: { options: [...options] },
  };
}

const SHOT_SCALE_OPTIONS = ['ECU', 'CU', 'MCU', 'MS', 'MLS', 'LS', 'VLS', 'ELS'] as const;
const CAMERA_MOVEMENT_OPTIONS = [
  'static',
  'pan',
  'tilt',
  'zoom-in',
  'zoom-out',
  'dolly',
  'dolly-in',
  'dolly-out',
  'handheld',
  'crane',
] as const;
const CAMERA_ANGLE_OPTIONS = ['eye-level', 'high-angle', 'low-angle', 'bird-eye', 'dutch'] as const;
const STORYBOARD_MEDIA_REF_ITEM_BLOCKS = [
  readonlyItemField('storyboard-media-ref-role', 'input', '/role', 'preset.shot.mediaRole'),
  readonlyItemField('storyboard-media-ref-label', 'input', '/label', 'preset.shot.mediaLabel'),
  readonlyItemField('storyboard-media-ref-mime', 'input', '/mimeType', 'preset.shot.mimeType'),
  readonlyItemField(
    'storyboard-media-ref-locator-type',
    'input',
    '/locator/type',
    'preset.shot.locatorType',
  ),
  readonlyItemField(
    'storyboard-media-ref-asset-index',
    'number',
    '/locator/assetIndex',
    'preset.shot.assetIndex',
  ),
  readonlyItemField(
    'storyboard-media-ref-tool-call',
    'input',
    '/locator/toolCallId',
    'preset.shot.toolCallId',
  ),
  readonlyItemField(
    'storyboard-media-ref-asset-id',
    'input',
    '/locator/assetId',
    'preset.shot.assetId',
  ),
  readonlyItemField('storyboard-media-ref-path', 'input', '/locator/path', 'preset.shot.path'),
] as const;
const GALLERY_PRESET_OPTIONS = [
  'character-3view',
  'character-4view',
  'expression-9',
  'turnaround-8',
  'scene-views',
  'custom',
] as const;

function getMediaPreviewRole(node: CanvasNodeDraft): CanvasPreviewRole {
  if (node.type !== 'media') {
    return 'unavailable';
  }

  switch (node.data.mediaType) {
    case 'video':
      return 'video-proxy';
    case 'audio':
      return 'audio-waveform';
    case 'image':
      return 'image';
    default:
      return 'unavailable';
  }
}

function getDraftContainerChildIds(node: CanvasNodeDraft): string[] {
  return uniqueStrings(node.container?.childIds ?? []);
}

function joinLabelParts(parts: Array<string | undefined>): string | undefined {
  const value = parts.filter((part): part is string => Boolean(part)).join(' · ');
  return value || undefined;
}

function uniqueStrings<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values));
}

function arePreviewDescriptorsEqual(
  left: NodePreviewDescriptor | undefined,
  right: NodePreviewDescriptor,
): boolean {
  if (!left) {
    return false;
  }

  return areValuesEqual(left, right);
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((entry, index) => areValuesEqual(entry, right[index]));
  }

  if (!isPlainRecord(left) || !isPlainRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(right, key) && areValuesEqual(left[key], right[key]),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasMarkdownReviewRows(node: CanvasNodeDraft): boolean {
  const rawData: unknown = node.data;
  if (!isPlainRecord(rawData)) return false;
  const rawMarkdown = rawData['markdown'];
  if (!isPlainRecord(rawMarkdown)) return false;
  const rawRows = rawMarkdown['rows'];
  return Array.isArray(rawRows) && rawRows.length > 0;
}

function getMediaRuntimeBindingPath(node: CanvasNodeDraft): JsonPointerPath {
  return node.type === 'media' && node.data.runtimeAssetPath ? '/runtimeAssetPath' : '/assetPath';
}

function extractBasename(path: string | undefined): string | undefined {
  if (!path) return undefined;
  try {
    const url = new URL(path);
    return decodeURIComponent(url.pathname.split('/').pop() ?? path);
  } catch {
    return path.split('/').pop() ?? path;
  }
}
