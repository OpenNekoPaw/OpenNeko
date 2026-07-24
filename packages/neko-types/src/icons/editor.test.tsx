import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  RightPanelIcon,
  RightPanelOffIcon,
  UnlockIcon,
} from './editor';

describe('editor icons', () => {
  it('exports shared right panel visibility icons', () => {
    expect(renderToStaticMarkup(<RightPanelIcon />)).toContain('<rect');
    expect(renderToStaticMarkup(<RightPanelOffIcon />)).toContain('M5 21 21 5');
  });

  it('exports font-independent visibility and lock icons', () => {
    expect(renderToStaticMarkup(<EyeIcon />)).toContain('<circle');
    expect(renderToStaticMarkup(<EyeOffIcon />)).toContain('M3 3l18 18');
    expect(renderToStaticMarkup(<LockIcon />)).toContain('M8 10V7a4 4 0 0 1 8 0v3');
    expect(renderToStaticMarkup(<UnlockIcon />)).toContain('M8 10V7a4 4 0 0 1 7.5-2');
  });
});
