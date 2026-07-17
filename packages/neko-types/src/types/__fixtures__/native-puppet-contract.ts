import type { NkEntityArtifactV2 } from '../asset-export';
import type { NkpNativeProjectData } from '../puppet';

export const nativePuppetProjectFixture: NkpNativeProjectData = {
  version: '2.0',
  name: 'Sakura Native',
  puppet: {
    src: null,
    format: 'native',
    animationModel: 'bone-blendshape',
    importSource: {
      kind: 'live2d-bundle',
      path: './sakura-live2d.zip',
      contentHash: 'sha256:native-fixture',
    },
  },
  layers: [
    {
      id: 'layer-face',
      name: 'Face',
      textureRef: 'textures/face.png',
      mesh: {
        id: 'mesh-face',
        vertices: [
          [0, 0],
          [10, 0],
          [0, 10],
        ],
        uvs: [
          [0, 0],
          [1, 0],
          [0, 1],
        ],
        triangles: [[0, 1, 2]],
      },
      skinWeights: {
        meshId: 'mesh-face',
        jointIndices: [
          [0, 1, 0, 0],
          [0, 1, 0, 0],
          [0, 1, 0, 0],
        ],
        jointWeights: [
          [0.25, 0.75, 0, 0],
          [0.2, 0.8, 0, 0],
          [0.3, 0.7, 0, 0],
        ],
      },
    },
  ],
  skeleton: {
    bones: [
      { id: 'bone-root', name: 'root', parent: null, position: [0, 0], rotation: 0 },
      { id: 'bone-head', name: 'head', parent: 'bone-root', position: [0, -40], rotation: 0 },
    ],
    ikConstraints: [
      {
        id: 'ik-head',
        targetBone: 'bone-head',
        endBone: 'bone-head',
        chainLength: 1,
        solver: { type: 'ccd', maxIterations: 4 },
      },
    ],
    pathConstraints: [
      {
        id: 'path-head-arc',
        bone: 'bone-head',
        path: [
          [0, -42],
          [2, -44],
        ],
        influence: 0.25,
      },
    ],
    springBones: [
      {
        id: 'spring-hair',
        bone: 'bone-head',
        stiffness: 0.7,
        damping: 0.35,
        gravityScale: 0.1,
      },
    ],
  },
  blendShapes: {
    standard: 'arkit_52',
    implemented: ['jawOpen', 'mouthSmileLeft'],
    shapes: [
      {
        id: 'shape-jaw-open',
        name: 'jawOpen',
        meshId: 'mesh-face',
        vertexDeltas: [
          [0, 0],
          [0, 1],
          [0, 1],
        ],
      },
    ],
  },
  controlDrivers: [
    {
      id: 'driver-jaw-open',
      source: { type: 'blendshape', name: 'jawOpen' },
      target: { type: 'boneRotation', bone: 'bone-head', axis: 'z' },
      curve: { type: 'linear', scale: 18 },
      blendMode: 'add',
      priority: 0,
    },
  ],
  expressions: {
    happy: { mouthSmileLeft: 0.8 },
  },
  animations: [
    {
      name: 'idle',
      durationMs: 1000,
      boneTracks: [
        {
          bone: 'bone-head',
          rotationKeys: [
            { timeMs: 0, value: 0, easing: { type: 'linear' } },
            { timeMs: 1000, value: 2 },
          ],
        },
      ],
      blendshapeTracks: [
        {
          blendshape: 'jawOpen',
          weightKeys: [
            { timeMs: 0, value: 0 },
            { timeMs: 500, value: 0.4 },
          ],
        },
      ],
    },
  ],
  autoRig: {
    template: 'humanoid_upper',
    generatedBy: 'neko-auto-rig/fixture',
    confidence: 0.87,
    sourceKind: 'live2d-bundle',
    userAdjusted: ['bone:bone-head', 'blendshape:jawOpen'],
  },
  parameters: {},
  faceParameters: {},
  viewport: { zoom: 1 },
};

export const nativePuppetEntityFixture: NkEntityArtifactV2 = {
  format: 'nkentity',
  version: 2,
  entity: {
    kind: 'character',
    name: 'Sakura',
    metadata: {
      rig_template: 'humanoid_upper',
      blendshape_standard: 'arkit_52',
    },
  },
  bindings: [
    {
      role: 'puppet-bone',
      ref: 'project://puppets/sakura-native.nkp',
      mediaKind: 'puppet-model',
      dimension: 'model',
      metadata: {
        animationModel: 'bone-blendshape',
        implementedBlendShapes: ['jawOpen', 'mouthSmileLeft'],
      },
    },
    {
      role: 'live2d',
      ref: 'project://puppets/sakura-live2d.nkp',
      mediaKind: 'puppet-model',
      dimension: 'model',
      optional: true,
    },
  ],
  exportedAt: '2026-05-21T00:00:00.000Z',
  metadata: {
    nativePuppet: {
      rigTemplate: 'humanoid_upper',
      blendshapeStandard: 'arkit_52',
      implementedBlendShapes: ['jawOpen', 'mouthSmileLeft'],
      animationModel: 'bone-blendshape',
      sourceKind: 'live2d-bundle',
    },
  },
};
