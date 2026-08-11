import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryResourceCard } from './EntryResourceCard';

describe('EntryResourceCard', () => {
  it('keeps media, metadata, selection, and actions in one accessible card structure', () => {
    const onSelect = vi.fn();
    const onSecondary = vi.fn();
    const { container } = render(
      <EntryResourceCard
        label="Arcadia"
        description="World Project"
        metadata="Published"
        media={<span>preview</span>}
        selected
        onSelect={onSelect}
        secondaryAction={{ label: 'Open', onClick: onSecondary }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Arcadia/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSecondary).toHaveBeenCalledOnce();
    expect(container.querySelector('.agent-entry-resource-card-media')?.textContent).toBe(
      'preview',
    );
    expect(
      container.querySelector('.agent-entry-resource-card')?.getAttribute('data-selected'),
    ).toBe('true');
    expect(container.querySelector('.agent-entry-resource-card-selected')).toBeTruthy();
  });
});
