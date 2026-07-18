// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentContextPayload } from '@neko/shared';
import { AgentContextChip } from './AgentContextChip';

describe('AgentContextChip', () => {
  it('projects the canonical context discriminator for functional evidence', () => {
    const payload: AgentContextPayload = {
      type: 'model-preview',
      id: 'model-preview:fixture:1',
      label: 'triangle.glb',
      summary: 'GLB model',
      data: {},
    };
    const { container } = render(<AgentContextChip payload={payload} />);

    expect(container.querySelector('[data-agent-context-type="model-preview"]')).not.toBeNull();
    expect(screen.getByText('triangle.glb')).toBeTruthy();
  });
});
