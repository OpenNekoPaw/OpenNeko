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
      accepted: { kind: 'character', names: { canonical: 'Nova', aliases: [] } },
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
          entityId: 'location-school',
          bindings: [],
          operations: ['edit'],
          blockers: [{ code: 'dialogue-unsupported', message: 'Dialogue is unavailable.' }],
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Start dialogue' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open room' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Embody' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByText('Facts')).toBeNull();
    expect(screen.queryByText('Provenance')).toBeNull();
    expect(screen.getByText('Dialogue is unavailable.')).toBeTruthy();
  });

  it('emits a canonical workspace ContentLocator when binding a representation', () => {
    const onIntent = vi.fn();
    render(
      <EntityInspector
        locale="en"
        onIntent={onIntent}
        projection={{
          status: 'confirmed',
          kind: 'character',
          names: { canonical: 'Nova', aliases: [] },
          entityId: 'character-nova',
          bindings: [],
          operations: ['bind'],
          blockers: [],
        }}
      />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Workspace path' }), {
      target: { value: 'characters/nova.png' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bind' }));

    expect(onIntent).toHaveBeenCalledWith({
      type: 'bind',
      entityId: 'character-nova',
      binding: {
        role: 'reference',
        target: { file: { authority: 'workspace', path: 'characters/nova.png' } },
      },
    });
  });
});
