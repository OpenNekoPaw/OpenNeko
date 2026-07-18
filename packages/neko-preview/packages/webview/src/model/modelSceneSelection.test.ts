import { describe, expect, it } from 'vitest';
import { modelSceneSelectionId, parseModelSceneSelection } from './modelSceneSelection';

describe('model scene selection', () => {
  it('round-trips scene, camera, and stable node identities', () => {
    const selections = [
      { kind: 'scene' as const },
      { kind: 'camera' as const, cameraId: 'camera:portrait' },
      { kind: 'node' as const, nodePath: 'root/0:Character/2:hair' },
    ];
    for (const selection of selections) {
      expect(parseModelSceneSelection(modelSceneSelectionId(selection))).toEqual(selection);
    }
  });

  it('does not reinterpret hierarchy group identities as editable selections', () => {
    expect(parseModelSceneSelection('model-group:cameras')).toBeUndefined();
    expect(parseModelSceneSelection('model-group:characters')).toBeUndefined();
  });
});
