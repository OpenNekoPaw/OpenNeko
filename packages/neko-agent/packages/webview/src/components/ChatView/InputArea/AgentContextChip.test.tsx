// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentContextPayload } from '@neko/shared';
import { AgentContextChip } from './AgentContextChip';

describe('AgentContextChip', () => {
  it('projects the canonical context discriminator for functional evidence', () => {
    const payload: AgentContextPayload = {
      type: '3d-reference',
      id: '3d-reference:fixture:1',
      label: 'Neutral mannequin',
      summary: 'Pose and camera reference',
      data: {},
    };
    const { container } = render(<AgentContextChip payload={payload} />);

    expect(container.querySelector('[data-agent-context-type="3d-reference"]')).not.toBeNull();
    expect(screen.getByText('Neutral mannequin')).toBeTruthy();
  });
});
