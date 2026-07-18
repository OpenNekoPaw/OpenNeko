import { describe, expect, it } from 'vitest';

describe('model preview manifest', () => {
  it('registers only the fixed standard model selector without Engine dependency', () => {
    const manifest = require('../../../../package.json') as {
      readonly activationEvents?: readonly string[];
      readonly extensionDependencies?: readonly string[];
      readonly contributes?: {
        readonly customEditors?: readonly {
          readonly viewType: string;
          readonly selector: readonly { readonly filenamePattern: string }[];
        }[];
      };
    };
    const editor = manifest.contributes?.customEditors?.find(
      (candidate) => candidate.viewType === 'neko.modelPreview',
    );
    expect(editor?.selector).toEqual([{ filenamePattern: '*.{glb,gltf,obj,stl,ply}' }]);
    expect(manifest.activationEvents).toContain('onCustomEditor:neko.modelPreview');
    expect(manifest.extensionDependencies).toBeUndefined();
  });
});
