import { describe, expect, it } from 'vitest';
import {
  ENTITY_BINDING_WIDGET_ACTIONS,
  ENTITY_FACADE_COMMANDS,
  isEntityBindingWidgetTriggerRequest,
  isEntityFacadeAliasRequest,
  isEntityFacadeRepresentationReverseLookupRequest,
  isEntityFacadeRepresentationReverseLookupResult,
  isEntityFacadeBindingLifecycleRequest,
  isEntityFacadeCommandError,
  isEntityFacadeConfirmCandidateRequest,
  isEntityFacadeInspectEntityRequest,
  isEntityFacadeListBindingsRequest,
  isEntityFacadeRebindRepresentationRequest,
  isEntityFacadeRenameEntityRequest,
  isEntityFacadeResolveByNameRequest,
  isEntityFacadeTreeItem,
  isEntityFacadeUnbindRepresentationRequest,
  isEntityFacadeUpdateMetadataRequest,
  isEntityFacadeUpsertBindingRequest,
  isEntityFacadeNameCandidateRequest,
} from '../creative-entity-facade';

describe('creative entity facade contracts', () => {
  it('declares serializable command ids and trigger actions', () => {
    expect(ENTITY_FACADE_COMMANDS.confirmCandidate).toBe('neko.entity.confirmCandidate');
    expect(ENTITY_FACADE_COMMANDS.inspectEntity).toBe('neko.entity.inspectEntity');
    expect(ENTITY_FACADE_COMMANDS.findEntitiesByRepresentation).toBe(
      'neko.entity.findEntitiesByRepresentation',
    );
    expect(ENTITY_FACADE_COMMANDS.listBindings).toBe('neko.entity.listBindings');
    expect(ENTITY_FACADE_COMMANDS.unbindRepresentation).toBe('neko.entity.unbindRepresentation');
    expect(ENTITY_FACADE_COMMANDS.rebindRepresentation).toBe('neko.entity.rebindRepresentation');
    expect(ENTITY_FACADE_COMMANDS.archiveBinding).toBe('neko.entity.archiveBinding');
    expect(ENTITY_FACADE_COMMANDS.nameCandidate).toBe('neko.entity.nameCandidate');
    expect(ENTITY_FACADE_COMMANDS.triggerBindingWidgetAction).toBe(
      'neko.entity.triggerBindingWidgetAction',
    );
    expect(ENTITY_BINDING_WIDGET_ACTIONS).toContain('bind-representation');
    expect(ENTITY_BINDING_WIDGET_ACTIONS).toContain('unbind-representation');
    expect(ENTITY_BINDING_WIDGET_ACTIONS).toContain('archive-binding');
    expect(ENTITY_BINDING_WIDGET_ACTIONS).toContain('name-candidate');
    expect(ENTITY_BINDING_WIDGET_ACTIONS).not.toContain('open-dashboard');
  });

  it('validates lifecycle and quick edit command requests', () => {
    const entityRef = {
      entityId: 'char_xiaoju',
      entityKind: 'character',
      projectRoot: '/workspace',
      source: 'neko-entity',
    };

    expect(
      isEntityFacadeConfirmCandidateRequest({
        projectRoot: '/workspace',
        candidateId: 'candidate:character:xiaoju',
        aliases: ['Xiaoju'],
      }),
    ).toBe(true);
    expect(
      isEntityFacadeRenameEntityRequest({
        projectRoot: '/workspace',
        entityRef,
        canonicalName: '小橘',
        keepPreviousAsAlias: true,
      }),
    ).toBe(true);
    expect(
      isEntityFacadeAliasRequest({
        projectRoot: '/workspace',
        entityRef,
        alias: 'Xiaoju',
      }),
    ).toBe(true);
    expect(
      isEntityFacadeResolveByNameRequest({
        projectRoot: '/workspace',
        name: '小橘',
        kind: 'character',
      }),
    ).toBe(true);
    expect(
      isEntityFacadeInspectEntityRequest({
        projectRoot: '/workspace',
        entityRef,
        context: { surface: 'canvas', projectRoot: '/workspace', nodeId: 'shot-1' },
      }),
    ).toBe(true);
    expect(
      isEntityFacadeListBindingsRequest({
        projectRoot: '/workspace',
        entityRef,
        representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju.png' },
      }),
    ).toBe(true);
    expect(
      isEntityFacadeUnbindRepresentationRequest({
        projectRoot: '/workspace',
        bindingId: 'binding-1',
      }),
    ).toBe(true);
    expect(
      isEntityFacadeBindingLifecycleRequest({
        projectRoot: '/workspace',
        bindingIds: ['binding-1'],
        orphanedAt: '2026-06-10T00:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      isEntityFacadeRebindRepresentationRequest({
        projectRoot: '/workspace',
        bindingId: 'binding-1',
        representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju.png' },
      }),
    ).toBe(true);
    expect(
      isEntityFacadeNameCandidateRequest({
        projectRoot: '/workspace',
        candidateId: 'candidate:visual:1',
        name: '小橘',
      }),
    ).toBe(true);
  });

  it('rejects unsafe or unsupported facade payloads', () => {
    expect(isEntityFacadeConfirmCandidateRequest({ candidateId: '' })).toBe(false);
    expect(
      isEntityFacadeRenameEntityRequest({
        entityRef: { entityId: 'char_xiaoju', entityKind: 'vehicle' },
        canonicalName: '小橘',
      }),
    ).toBe(false);
    expect(
      isEntityFacadeUpdateMetadataRequest({
        projectRoot: '/workspace',
        entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
        metadata: { longMemory: 'not supported by quick edit' },
      }),
    ).toBe(false);
    expect(
      isEntityFacadeUpsertBindingRequest({
        projectRoot: '/workspace',
        binding: {
          id: 'binding-1',
          entityId: 'char_xiaoju',
          entityKind: 'character',
          representation: { kind: 'workspace-file', path: 'file:///unsafe.png' },
          role: 'portrait',
          status: 'confirmed',
          availability: 'active',
          source: 'user',
        },
      }),
    ).toBe(false);
  });

  it('validates widget trigger requests without vscode or webview types', () => {
    expect(
      isEntityBindingWidgetTriggerRequest({
        context: {
          surface: 'canvas',
          projectRoot: '/workspace',
          nodeId: 'shot-1',
        },
        action: 'bind-representation',
        entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
        representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju-portrait.png' },
        role: 'portrait',
      }),
    ).toBe(true);
    expect(
      isEntityBindingWidgetTriggerRequest({
        context: { surface: 'canvas' },
        action: 'write-files-directly',
      }),
    ).toBe(false);
    expect(
      isEntityBindingWidgetTriggerRequest({
        context: { surface: 'assets', projectRoot: '/workspace' },
        action: 'unbind-representation',
        payload: { bindingId: 'binding-1' },
      }),
    ).toBe(true);
  });

  it('validates typed command errors', () => {
    expect(
      isEntityFacadeCommandError({
        code: 'invalid-request',
        message: 'Bad payload',
        diagnostics: ['entityRef is required'],
      }),
    ).toBe(true);
    expect(isEntityFacadeCommandError({ code: 'throw', message: 'Bad payload' })).toBe(false);
  });

  it('validates inspector tree and asset reverse lookup DTOs', () => {
    expect(
      isEntityFacadeTreeItem({
        id: 'entity:char_xiaoju',
        label: '小橘',
        kind: 'character',
        status: 'confirmed',
        entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
        aliases: ['Xiaoju'],
        defaultBindingRoles: ['portrait'],
      }),
    ).toBe(true);
    expect(
      isEntityFacadeTreeItem({
        id: 'candidate:candidate_xiaoju',
        label: '小橘?',
        kind: 'character',
        status: 'open',
        candidateId: 'candidate_xiaoju',
      }),
    ).toBe(true);
    expect(
      isEntityFacadeRepresentationReverseLookupRequest({
        projectRoot: '/workspace',
        representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju.png' },
      }),
    ).toBe(true);
    expect(
      isEntityFacadeRepresentationReverseLookupResult({
        representation: { kind: 'workspace-file', path: 'neko/assets/xiaoju.png' },
        entities: [
          {
            entityRef: { entityId: 'char_xiaoju', entityKind: 'character' },
            label: '小橘',
            role: 'portrait',
            bindingId: 'binding-1',
            status: 'confirmed',
            availability: 'orphaned',
          },
        ],
      }),
    ).toBe(true);
  });
});
