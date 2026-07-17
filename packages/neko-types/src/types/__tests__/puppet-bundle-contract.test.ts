import { describe, expect, it } from 'vitest';
import nativePuppetV2Fixture from '../__fixtures__/native-puppet-v2.json';
import {
  createNkpPuppetRuntimeAdapterDescriptor,
  diagnoseNkpSceneAuthoringFields,
  isNkpNativeProjectData,
  isNkpProjectData,
  isPuppetCommandAck,
  isPuppetCommandEnvelope,
  type NkpProjectData,
  type PuppetCommandEnvelope,
} from '../puppet';
import { nativePuppetProjectFixture } from '../__fixtures__/native-puppet-contract';

describe('nkp bundle contract', () => {
  it('preserves legacy puppet src compatibility', () => {
    const project: NkpProjectData = {
      version: '1',
      name: 'Legacy Moc3',
      puppet: {
        src: './model.moc3',
        format: 'moc3',
      },
      parameters: {},
      viewport: { zoom: 1 },
    };

    expect(project.puppet.src).toBe('./model.moc3');
    expect(project.puppet.bundle).toBeUndefined();
    expect(isNkpProjectData(project)).toBe(true);
    expect(isNkpNativeProjectData(project)).toBe(false);
  });

  it('represents a bundle-memory Live2D source with lightweight bundle index', () => {
    const project: NkpProjectData = {
      version: '1',
      name: 'Bundle Backed',
      puppet: {
        src: null,
        format: 'moc3',
        runtimeAdapter: {
          id: 'live2d-moc3-compat',
          version: 'clean-room',
          importSettings: {
            motionGroups: ['Idle'],
          },
        },
        bundle: {
          path: './sakura.zip',
          contentHash: 'sha256:abc',
          manifest: {
            bundlePath: './sakura.zip',
            entryPath: 'avatars/sakura/model3.json',
            fragmentRef: './sakura.zip#avatars/sakura/model3.json',
          },
          moc: {
            bundlePath: './sakura.zip',
            entryPath: 'avatars/sakura/model.moc3',
            fragmentRef: './sakura.zip#avatars/sakura/model.moc3',
          },
        },
      },
      bundleIndex: {
        storageMode: 'bundle-memory',
        manifest: {
          bundlePath: './sakura.zip',
          entryPath: 'avatars/sakura/model3.json',
          fragmentRef: './sakura.zip#avatars/sakura/model3.json',
        },
        moc: {
          bundlePath: './sakura.zip',
          entryPath: 'avatars/sakura/model.moc3',
          fragmentRef: './sakura.zip#avatars/sakura/model.moc3',
        },
        textures: [
          {
            index: 0,
            locator: {
              bundlePath: './sakura.zip',
              entryPath: 'avatars/sakura/textures/texture_00.png',
              fragmentRef: './sakura.zip#avatars/sakura/textures/texture_00.png',
            },
          },
        ],
        motions: [],
        expressions: [],
        parameterIds: ['ParamAngleX'],
      },
      parameters: {},
      viewport: { zoom: 1 },
    };

    expect(project.puppet.src).toBeNull();
    expect(project.puppet.runtimeAdapter?.id).toBe('live2d-moc3-compat');
    expect(project.bundleIndex?.textures[0]?.locator.entryPath).toBe(
      'avatars/sakura/textures/texture_00.png',
    );
    expect(isNkpProjectData(project)).toBe(true);
  });

  it('keeps Puppet runtime adapter contracts SDK-neutral', () => {
    const moc3Compat = createNkpPuppetRuntimeAdapterDescriptor('live2d-moc3-compat');
    const cubismUnavailable = createNkpPuppetRuntimeAdapterDescriptor('live2d-cubism', {
      status: 'unavailable',
      diagnostics: [
        {
          code: 'cubism-adapter-unavailable',
          severity: 'error',
          message: 'Cubism SDK adapter is not enabled in this build.',
        },
      ],
    });

    expect(moc3Compat).toMatchObject({
      id: 'live2d-moc3-compat',
      owner: 'neko-puppet',
      status: 'compatibility',
      sdkNeutral: true,
      sourceCompatibility: ['moc3'],
    });
    expect(cubismUnavailable).toMatchObject({
      id: 'live2d-cubism',
      owner: 'neko-puppet',
      status: 'unavailable',
      sdkNeutral: true,
      diagnostics: [expect.objectContaining({ code: 'cubism-adapter-unavailable' })],
    });
    expect(
      isNkpProjectData({
        version: '2.0',
        name: 'Invalid Adapter',
        puppet: {
          src: null,
          format: 'moc3',
          runtimeAdapter: { id: 'cubism-sdk-object-handle', handle: 1234 },
        },
        parameters: {},
        viewport: { zoom: 1 },
      }),
    ).toBe(false);
    expect(
      JSON.stringify({
        version: '2.0',
        name: 'Persisted Adapter',
        puppet: {
          src: './model.moc3',
          format: 'moc3',
          runtimeAdapter: { id: 'live2d-cubism', version: '5' },
        },
        parameters: {},
        viewport: { zoom: 1 },
      }),
    ).not.toMatch(/sessionId|streamId|rangeUrl|handle/);
  });

  it('round-trips native .nkp v2 bone + blendshape contracts', () => {
    const roundTripped = JSON.parse(JSON.stringify(nativePuppetProjectFixture)) as unknown;

    expect(isNkpProjectData(roundTripped)).toBe(true);
    expect(isNkpNativeProjectData(roundTripped)).toBe(true);
    expect(roundTripped).toEqual(nativePuppetProjectFixture);
  });

  it('validates the native .nkp v2 JSON golden fixture', () => {
    const roundTripped = JSON.parse(JSON.stringify(nativePuppetV2Fixture)) as unknown;

    expect(isNkpNativeProjectData(roundTripped)).toBe(true);
  });

  it('rejects invalid native blendshape delta shapes', () => {
    const invalid = {
      ...nativePuppetProjectFixture,
      blendShapes: {
        ...nativePuppetProjectFixture.blendShapes,
        shapes: [
          {
            id: 'shape-bad',
            name: 'jawOpen',
            meshId: 'mesh-face',
            vertexDeltas: [[0]],
          },
        ],
      },
    };

    expect(isNkpNativeProjectData(invalid)).toBe(false);
  });

  it('validates native puppet command envelopes and acknowledgements', () => {
    const envelope: PuppetCommandEnvelope = {
      seq: 1,
      baseRevision: 0,
      transactionId: 'drag-bone-1',
      command: {
        type: 'setNativeBoneTransform',
        bone: 'bone-head',
        mode: 'offset',
        transform: { position: [2, -1], rotation: 4 },
      },
    };

    expect(isPuppetCommandEnvelope(envelope)).toBe(true);
    expect(
      isPuppetCommandEnvelope({
        ...envelope,
        command: { type: 'setNativeBlendShapeDelta', name: 'jawOpen', meshId: 'mesh-face' },
      }),
    ).toBe(false);
    expect(
      isPuppetCommandAck({
        seq: 1,
        appliedSeq: 1,
        baseRevision: 0,
        revision: 1,
        status: 'applied',
        result: null,
      }),
    ).toBe(true);
  });

  it('reports generic 2D scene authoring fields as wrong-domain NKP data', () => {
    const diagnostics = diagnoseNkpSceneAuthoringFields({
      version: '2.0',
      name: 'Wrong Domain',
      puppet: { src: './model.moc3', scene: { nodes: [] } },
      tilemaps: [],
      sceneCamera: { position: [0, 0], zoom: 1 },
      parameters: {},
      viewport: { zoom: 1 },
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'wrong-domain-field', path: ['tilemaps'] }),
        expect.objectContaining({ code: 'wrong-domain-field', path: ['sceneCamera'] }),
        expect.objectContaining({ code: 'wrong-domain-field', path: ['puppet', 'scene'] }),
      ]),
    );
  });
});
