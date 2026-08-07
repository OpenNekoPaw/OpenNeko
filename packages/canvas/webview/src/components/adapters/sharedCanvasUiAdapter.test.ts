import { isValidElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createCanvasAddActionIcon } from './sharedCanvasUiAdapter';

describe('sharedCanvasUiAdapter', () => {
  it('uses the shared icon system for canonical add action icons', () => {
    const icon = createCanvasAddActionIcon('image', '#3b82f6');

    expect(isValidElement(icon)).toBe(true);
    expect(icon).toMatchObject({
      type: 'span',
      props: {
        'data-canvas-add-action-icon': 'image',
      },
    });
    expect(icon).toHaveProperty(
      ['props', 'className'],
      expect.stringContaining('codicon-symbol-color'),
    );
  });
});
