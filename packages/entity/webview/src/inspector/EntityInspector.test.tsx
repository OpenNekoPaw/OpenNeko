import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntityInspector } from './EntityInspector';

describe('EntityInspector', () => {
  it('renders candidate evidence and emits a typed confirmation intent', () => {
    const onIntent = vi.fn();
    render(
      <EntityInspector
        locale="en"
        onIntent={onIntent}
        projection={{
          status: 'candidate',
          kind: 'character',
          names: { canonical: 'Nova', aliases: [] },
          facts: {},
          candidateId: 'candidate-nova',
          evidence: [
            { evidenceId: 'evidence-nova', owner: 'document', sourceId: 'story.fountain' },
          ],
          bindings: [],
          operations: ['confirm'],
          blockers: [],
        }}
      />,
    );
    expect(screen.getByText('story.fountain')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onIntent).toHaveBeenCalledWith({
      type: 'confirm',
      candidateId: 'candidate-nova',
      accepted: { kind: 'character', names: { canonical: 'Nova', aliases: [] }, facts: {} },
    });
  });

  it('hides unsupported interaction actions and shows blockers', () => {
    render(
      <EntityInspector
        locale="en"
        onIntent={vi.fn()}
        projection={{
          status: 'confirmed',
          kind: 'location',
          names: { canonical: 'School', aliases: [] },
          facts: {},
          entityId: 'location-school',
          bindings: [],
          operations: ['edit'],
          blockers: [{ code: 'dialogue-unsupported', message: 'Dialogue is unavailable.' }],
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Start dialogue' })).toBeNull();
    expect(screen.getByText('Dialogue is unavailable.')).toBeTruthy();
  });
});
