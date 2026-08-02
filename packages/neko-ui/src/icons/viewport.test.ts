import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  AxesIcon,
  FrameSelectionIcon,
  GridIcon,
  InspectIcon,
  CubeIcon,
  LightIcon,
  MannequinIcon,
  PanoramaIcon,
  MoveIcon,
  PointerIcon,
  RotateIcon,
  ScaleIcon,
} from './viewport';

describe('viewport icons', () => {
  it('renders every viewport action with the shared SVG geometry', () => {
    const icons = [
      PointerIcon,
      InspectIcon,
      MoveIcon,
      RotateIcon,
      ScaleIcon,
      GridIcon,
      AxesIcon,
      FrameSelectionIcon,
      MannequinIcon,
      CubeIcon,
      LightIcon,
      PanoramaIcon,
    ];

    for (const Icon of icons) {
      const markup = renderToStaticMarkup(React.createElement(Icon, { size: 18 }));
      expect(markup).toContain('<svg');
      expect(markup).toContain('width="18"');
      expect(markup).toContain('height="18"');
      expect(markup).toContain('viewBox="0 0 24 24"');
      expect(markup).toContain('stroke="currentColor"');
      expect(markup).toContain('stroke-width="2"');
    }
  });
});
