import { describe, expect, it } from 'vitest';
import { isRuntimeOnlyCanvasAuthoringResourceIdentityValue } from '../..';

describe('canvas authoring contracts', () => {
  it('classifies runtime-only resource identities without rejecting durable paths', () => {
    expect(isRuntimeOnlyCanvasAuthoringResourceIdentityValue('neko-media://panel/image.png')).toBe(
      true,
    );
    expect(isRuntimeOnlyCanvasAuthoringResourceIdentityValue('blob:neko-media/preview')).toBe(true);
    expect(isRuntimeOnlyCanvasAuthoringResourceIdentityValue('assets/cover.png')).toBe(false);
  });
});
