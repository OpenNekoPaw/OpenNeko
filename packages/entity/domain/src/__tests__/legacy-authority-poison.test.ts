import { describe, expect, it, vi } from 'vitest';
import {
  CreativeEntityService,
  EntityAssetRequirementService,
  EntityCandidateStore,
  EntityRepresentationBindingService,
  ProjectEntityRetiredAuthorityError,
  ProjectEntityStore,
  VisualIdentityDraftService,
  type EntityRuntimePorts,
} from '../index';

describe('fragmented Project Entity authority poison', () => {
  it.each([
    ['ProjectEntityStore', () => new ProjectEntityStore(options())],
    ['EntityCandidateStore', () => new EntityCandidateStore(options())],
    ['EntityRepresentationBindingService', () => new EntityRepresentationBindingService(options())],
    ['VisualIdentityDraftService', () => new VisualIdentityDraftService(options())],
    ['EntityAssetRequirementService', () => new EntityAssetRequirementService(options())],
    ['CreativeEntityService', () => new CreativeEntityService(options())],
  ])('%s fails closed before a legacy reader or writer can run', (_name, create) => {
    expect(create).toThrowError(ProjectEntityRetiredAuthorityError);
    try {
      create();
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: 'project-entity-migration-required' });
    }
    expect(files.readJson).not.toHaveBeenCalled();
    expect(files.writeJson).not.toHaveBeenCalled();
  });
});

const files = {
  readJson: vi.fn(async () => ({ version: 1 })),
  writeJson: vi.fn(async () => undefined),
};

function options(): { readonly projectRoot: string; readonly ports: EntityRuntimePorts } {
  files.readJson.mockClear();
  files.writeJson.mockClear();
  return { projectRoot: '/workspace', ports: { files } };
}
