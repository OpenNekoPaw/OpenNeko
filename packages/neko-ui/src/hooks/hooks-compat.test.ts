import { describe, expect, it } from 'vitest';
import * as sharedComponents from '@neko/shared/components';
import * as hooks from './index';
import * as primitives from '../primitives';

describe('@neko/ui hooks compatibility', () => {
  it('exposes resize and drag hooks through the canonical UI surface', () => {
    expect(hooks.useResizable).toBe(sharedComponents.useResizable);
    expect(hooks.usePersistedResize).toBe(sharedComponents.usePersistedResize);
    expect(hooks.useDrag).toBe(sharedComponents.useDrag);
    expect(hooks.useFileDrop).toBe(sharedComponents.useFileDrop);
  });

  it('exposes ResizeHandle through primitives while legacy import remains valid', () => {
    expect(primitives.ResizeHandle).toBe(sharedComponents.ResizeHandle);
  });
});
