import { describe, expect, it } from 'vitest';
import {
  confirmProjectMediaLibraryRecovery,
  createProjectMediaLibraryRecoveryPlan,
  parseProjectMediaLibraryBinding,
  parseProjectMediaLibraryBindingJson,
  parseProjectMediaLibraryAvailability,
  parseProjectMediaLibraryRequirement,
  projectMediaLibraryBindingRelativePath,
  serializeProjectMediaLibraryBinding,
} from '../project-media-library-binding';

const PROJECT_ID = 'project-neko';
const BINDING = {
  projectId: PROJECT_ID,
  libraryName: 'Footage',
  connectionId: 'media-library:nas:Footage',
  bindingFingerprint: 'sha256:0123456789abcdef',
} as const;

describe('Project Media Library binding contract', () => {
  it('round-trips one strict target-free record', () => {
    expect(
      parseProjectMediaLibraryBindingJson(serializeProjectMediaLibraryBinding(BINDING)),
    ).toEqual(BINDING);
    expect(projectMediaLibraryBindingRelativePath('Footage')).toBe(
      '.neko/media-libraries/Footage.json',
    );
  });

  it.each(['targetPath', 'provider', 'credential', 'runtimeUrl', 'cachePath'])(
    'rejects forbidden local field %s',
    (field) => {
      expect(() =>
        parseProjectMediaLibraryBinding({ ...BINDING, [field]: '/private/media' }),
      ).toThrow('unsupported field');
    },
  );

  it('rejects physical-looking identities and malformed library names', () => {
    expect(() =>
      parseProjectMediaLibraryBinding({ ...BINDING, connectionId: '/Volumes/Footage' }),
    ).toThrow('connection identity');
    expect(() =>
      parseProjectMediaLibraryBinding({ ...BINDING, libraryName: '../Footage' }),
    ).toThrow('portable logical segment');
  });

  it('creates an immutable explicit recovery confirmation', () => {
    const plan = createProjectMediaLibraryRecoveryPlan({
      projectId: BINDING.projectId,
      libraryName: BINDING.libraryName,
      connectionId: BINDING.connectionId,
      requirementFingerprint: 'sha256:requirement-footage-1234',
      validatedRelativePaths: ['shots/a.mov'],
      expectedBindingFingerprint: null,
      replacementBindingFingerprint: BINDING.bindingFingerprint,
    });
    const confirmation = confirmProjectMediaLibraryRecovery(plan);

    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(confirmation)).toBe(true);
    expect(confirmation).toEqual({ confirmed: true, plan });
  });

  it('strictly parses requirements and identity-scoped availability diagnostics', () => {
    expect(
      parseProjectMediaLibraryRequirement({
        projectId: PROJECT_ID,
        libraryName: 'Footage',
        requirementFingerprint: 'sha256:requirement-footage-1234',
        referenceCount: 3,
        relativePaths: ['shots/b.mov', 'shots/a.mov'],
      }),
    ).toEqual({
      projectId: PROJECT_ID,
      libraryName: 'Footage',
      requirementFingerprint: 'sha256:requirement-footage-1234',
      referenceCount: 3,
      relativePaths: ['shots/a.mov', 'shots/b.mov'],
    });
    expect(
      parseProjectMediaLibraryAvailability({
        projectId: PROJECT_ID,
        libraryName: 'Footage',
        state: 'required-unlinked',
        requiredRelativePaths: ['shots/a.mov'],
        diagnostic: {
          code: 'required-unlinked',
          projectId: PROJECT_ID,
          libraryName: 'Footage',
          message: 'This machine has no confirmed binding.',
        },
      }),
    ).toMatchObject({ state: 'required-unlinked' });
    expect(() =>
      parseProjectMediaLibraryAvailability({
        projectId: PROJECT_ID,
        libraryName: 'Footage',
        state: 'available',
        requiredRelativePaths: [],
        diagnostic: {
          code: 'connection-missing',
          projectId: PROJECT_ID,
          libraryName: 'Footage',
          message: 'mismatch',
        },
      }),
    ).toThrow('does not match');
  });
});
