import { describe, expect, it } from 'vitest';
import {
  CANVAS_AUTHORING_CATALOG_VERSION,
  CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES,
  CANVAS_AUTHORING_FIELD_ROLES,
  CANVAS_AUTHORING_FIELD_STORAGE_TARGETS,
  CANVAS_AUTHORING_FIELD_VALUE_TYPES,
  CANVAS_AUTHORING_PROMPT_SPAN_BEHAVIORS,
  TOOL_NAMES_CANVAS,
  type CanvasAuthoringFieldProfileDescriptor,
  isRuntimeOnlyCanvasAuthoringResourceIdentityValue,
  validateCanvasAuthoringCatalog,
  validateCanvasAuthoringCatalogRequest,
  validateCanvasAuthoringFieldProfileDescriptor,
  validateCanvasAuthoringResultEnvelope,
  validateCanvasAuthoringSemanticPromptDocument,
} from '../index';

describe('canvas authoring contracts', () => {
  it('rejects unsupported catalog versions with typed diagnostics', () => {
    const validation = validateCanvasAuthoringCatalogRequest({
      version: 999,
      sections: ['nodeTypes'],
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'unsupported-catalog-version',
        expected: CANVAS_AUTHORING_CATALOG_VERSION,
        received: 999,
      }),
    ]);
  });

  it('rejects runtime-only resource identities in authoring results', () => {
    expect(
      isRuntimeOnlyCanvasAuthoringResourceIdentityValue('vscode-webview://panel/image.png'),
    ).toBe(true);
    expect(isRuntimeOnlyCanvasAuthoringResourceIdentityValue('blob:vscode/preview')).toBe(true);
    expect(isRuntimeOnlyCanvasAuthoringResourceIdentityValue('assets/cover.png')).toBe(false);

    const validation = validateCanvasAuthoringResultEnvelope({
      version: 1,
      status: 'success',
      refs: [{ kind: 'resource', id: 'vscode-webview://panel/image.png' }],
      diagnostics: [],
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'runtime-only-resource-identity',
        target: 'refs[0].id',
      }),
    ]);
  });

  it('rejects malformed refs and unknown operation descriptors visibly', () => {
    const catalogValidation = validateCanvasAuthoringCatalog({
      version: 1,
      sections: ['operations'],
      operations: [
        {
          id: '',
          kind: 'magic',
          risk: 'unknown',
          status: 'available',
        },
      ],
      diagnostics: [],
    });

    expect(catalogValidation.valid).toBe(false);
    expect(catalogValidation.diagnostics).toEqual([
      expect.objectContaining({
        code: 'malformed-operation-descriptor',
        target: 'operations[0]',
      }),
    ]);

    const resultValidation = validateCanvasAuthoringResultEnvelope({
      version: 1,
      status: 'success',
      refs: [{ kind: 'node', id: '' }],
      diagnostics: [],
    });

    expect(resultValidation.valid).toBe(false);
    expect(resultValidation.diagnostics).toEqual([
      expect.objectContaining({
        code: 'malformed-authoring-ref',
        target: 'refs[0]',
      }),
    ]);
  });

  it('defines the Canvas authoring catalog query tool name', () => {
    expect(TOOL_NAMES_CANVAS.CANVAS_DESCRIBE_AUTHORING_CAPABILITIES).toBe(
      'canvas_describe_authoring_capabilities',
    );
  });

  it('models dynamic Canvas field profiles beyond existing table columns', () => {
    const profile = {
      id: 'storyboard.ai-native',
      namespace: 'canvas.storyboard',
      version: 1,
      aliases: ['storyboard', '分镜'],
      unknownFieldPolicy: 'preserve-custom',
      fields: [
        {
          id: 'character.appearance',
          namespace: 'entity.character',
          aliases: ['人物形象', '角色外观'],
          roles: ['character-appearance'],
          valueType: 'character-appearance',
          cardinality: 'optional',
          storageTarget: 'prompt-span',
          promptSpan: {
            behavior: 'bidirectional',
            spanKind: 'character-appearance',
            alignmentState: 'in-sync',
          },
          capabilityBinding: {
            capabilityId: 'entity.bindCharacterAppearance',
            requiresApproval: false,
            stableRefRequired: true,
          },
        },
        {
          id: 'voice.cue',
          namespace: 'audio.voice',
          aliases: ['语音', 'voice'],
          roles: ['voice'],
          valueType: 'voice-cue',
          cardinality: 'optional',
          storageTarget: 'capability-input',
          promptSpan: {
            behavior: 'field-projection',
            spanKind: 'voice-cue',
            alignmentState: 'fields-changed',
          },
          capabilityBinding: {
            capabilityId: 'audio.tts.generate',
            operationId: 'voice.generate',
            requiresApproval: true,
            stableRefRequired: true,
          },
        },
      ],
    } satisfies CanvasAuthoringFieldProfileDescriptor;

    expect(CANVAS_AUTHORING_FIELD_VALUE_TYPES).toContain('character-appearance');
    expect(CANVAS_AUTHORING_FIELD_VALUE_TYPES).toContain('voice-cue');
    expect(CANVAS_AUTHORING_FIELD_ROLES).toContain('character-appearance');
    expect(CANVAS_AUTHORING_FIELD_STORAGE_TARGETS).toContain('capability-input');
    expect(CANVAS_AUTHORING_PROMPT_SPAN_BEHAVIORS).toContain('bidirectional');
    expect(CANVAS_AUTHORING_FIELD_PROFILE_ALIGNMENT_STATES).toContain('fields-changed');
    expect(profile.fields.map((field) => field.id)).toEqual(['character.appearance', 'voice.cue']);
    expect(validateCanvasAuthoringFieldProfileDescriptor(profile).valid).toBe(true);
  });

  it('validates field profiles before they become Canvas authority', () => {
    const validation = validateCanvasAuthoringFieldProfileDescriptor({
      id: 'storyboard.invalid',
      namespace: '',
      version: 1,
      fields: [
        {
          id: '',
          namespace: 'canvas.storyboard',
          roles: ['voice'],
          valueType: 'runtime-url',
          cardinality: 'many',
          storageTarget: 'capability-input',
          promptSpan: {
            behavior: 'hidden-magic',
            alignmentState: 'auto-overwrite',
          },
        },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual([
      expect.objectContaining({ code: 'malformed-field-profile', target: 'namespace' }),
      expect.objectContaining({ code: 'malformed-field-descriptor', target: 'fields[0].id' }),
      expect.objectContaining({
        code: 'unsupported-field-value-type',
        target: 'fields[0].valueType',
      }),
      expect.objectContaining({
        code: 'unsupported-field-cardinality',
        target: 'fields[0].cardinality',
      }),
      expect.objectContaining({
        code: 'unsupported-prompt-span-behavior',
        target: 'fields[0].promptSpan.behavior',
      }),
      expect.objectContaining({
        code: 'unsupported-prompt-alignment-state',
        target: 'fields[0].promptSpan.alignmentState',
      }),
      expect.objectContaining({
        code: 'missing-capability-binding',
        target: 'fields[0].capabilityBinding',
      }),
    ]);
  });

  it('validates semantic prompt alignment without silently overwriting fields', () => {
    const profile = {
      id: 'storyboard.ai-native',
      namespace: 'canvas.storyboard',
      version: 1,
      unknownFieldPolicy: 'preserve-custom',
      fields: [
        {
          id: 'scene.info',
          namespace: 'canvas.storyboard',
          roles: ['scene'],
          valueType: 'text',
          storageTarget: 'prompt-span',
        },
        {
          id: 'voice.cue',
          namespace: 'audio.voice',
          roles: ['voice'],
          valueType: 'voice-cue',
          storageTarget: 'capability-input',
          capabilityBinding: {
            capabilityId: 'audio.tts.generate',
            requiresApproval: true,
            stableRefRequired: true,
          },
        },
      ],
    } satisfies CanvasAuthoringFieldProfileDescriptor;

    const validation = validateCanvasAuthoringSemanticPromptDocument(
      {
        text: 'Rainy alley. Aki whispers.',
        spans: [
          {
            id: 'span-scene',
            kind: 'scene',
            range: { start: 0, end: 11 },
            fieldId: 'scene.info',
            referenceStatus: 'resolved',
          },
        ],
        fieldProjections: [
          {
            fieldId: 'scene.info',
            value: 'Rainy alley',
            sourceSpanId: 'span-scene',
            alignmentState: 'prompt-overridden',
            userOverride: true,
          },
          {
            fieldId: 'voice.cue',
            value: 'whisper',
            alignmentState: 'fields-changed',
          },
        ],
        fieldSuggestions: [
          {
            fieldId: 'scene.info',
            suggestedValue: 'Rainy alley at night',
            sourceRange: { start: 0, end: 11 },
          },
        ],
        userOverride: true,
      },
      { fieldProfiles: [profile] },
    );

    expect(validation.valid).toBe(true);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          code: 'prompt-user-override-preserved',
          suggestedActions: expect.arrayContaining([
            expect.objectContaining({ id: 'keep-prompt' }),
          ]),
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'prompt-fields-changed',
          suggestedActions: expect.arrayContaining([
            expect.objectContaining({ id: 'merge-fields-into-prompt', requiresApproval: true }),
          ]),
        }),
        expect.objectContaining({
          severity: 'info',
          code: 'field-suggestion-requires-apply',
          suggestedActions: expect.arrayContaining([
            expect.objectContaining({ id: 'apply-field-suggestion', requiresApproval: true }),
          ]),
        }),
      ]),
    );
  });

  it('blocks unresolved semantic prompt refs and runtime-only prompt resources', () => {
    const validation = validateCanvasAuthoringSemanticPromptDocument({
      text: 'Use @Aki and ![[preview]]',
      spans: [
        {
          kind: 'character',
          range: { start: 4, end: 8 },
          fieldId: 'character.appearance',
          referenceStatus: 'ambiguous',
        },
        {
          kind: 'resource-ref',
          range: { start: 13, end: 24 },
          referenceStatus: 'resolved',
          ref: { kind: 'resource', id: 'blob:vscode/preview' },
        },
      ],
      fieldProjections: [
        {
          fieldId: 'character.appearance',
          value: 'Aki',
          alignmentState: 'conflict',
        },
      ],
    });

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'unresolved-prompt-reference',
          target: 'spans[0]',
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'runtime-only-resource-identity',
          target: 'spans[1].ref.id',
        }),
        expect.objectContaining({
          severity: 'error',
          code: 'prompt-field-conflict',
          suggestedActions: expect.arrayContaining([
            expect.objectContaining({ id: 'ask-agent-merge' }),
          ]),
        }),
      ]),
    );
  });
});
