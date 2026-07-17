import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RightPanelIcon, RightPanelOffIcon } from './editor';

describe('editor icons', () => {
  it('exports shared right panel visibility icons', () => {
    expect(renderToStaticMarkup(<RightPanelIcon />)).toContain('<rect');
    expect(renderToStaticMarkup(<RightPanelOffIcon />)).toContain('M5 21 21 5');
  });
});
