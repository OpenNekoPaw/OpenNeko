import { describe, expect, it } from 'vitest';
import * as hooks from './index';
import * as primitives from '../primitives';

describe('@neko/ui hooks public entry', () => {
  it('exposes resize and drag hooks through the canonical UI surface', () => {
    expect(hooks.useResizable).toBeTypeOf('function');
    expect(hooks.usePersistedResize).toBeTypeOf('function');
    expect(hooks.useDrag).toBeTypeOf('function');
    expect(hooks.useFileDrop).toBeTypeOf('function');
  });

  it('exposes ResizeHandle through the canonical primitives entry', () => {
    expect(primitives.ResizeHandle).toBeTypeOf('function');
  });
});
