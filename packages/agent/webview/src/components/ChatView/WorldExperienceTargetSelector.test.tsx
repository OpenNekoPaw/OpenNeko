import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorldExperienceTargetSelector } from './WorldExperienceTargetSelector';

vi.mock('../../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const value =
        {
          'chat.entryExperience.worldExperience.selectorLabel': 'Choose a World',
          'chat.entryExperience.worldExperience.loading': 'Loading Worlds',
          'chat.entryExperience.worldExperience.empty': 'No Worlds',
          'chat.entryExperience.worldExperience.selectExactVersion': 'Choose exact version',
          'chat.entryExperience.worldExperience.versionLabel': 'Usable version',
          'chat.entryExperience.worldExperience.versionForWorld': 'Usable version for {world}',
          'chat.entryExperience.worldExperience.versionCount': '{count} usable versions',
        }[key] ?? key;
      return Object.entries(params ?? {}).reduce(
        (result, [name, replacement]) => result.replace(`{${name}}`, String(replacement)),
        value,
      );
    },
  }),
}));

const targets = [
  {
    globalWorldId: 'global-world-a',
    worldVersionId: 'world-version-a-1',
    displayName: 'World A',
    versionLabel: 'Published A1',
  },
  {
    globalWorldId: 'global-world-a',
    worldVersionId: 'world-version-a-2',
    displayName: 'World A',
    versionLabel: 'Published A2',
  },
  {
    globalWorldId: 'global-world-b',
    worldVersionId: 'world-version-b-1',
    displayName: 'World B',
    versionLabel: 'Published B1',
  },
] as const;

describe('WorldExperienceTargetSelector', () => {
  it('keeps one exact WorldVersion and replaces it when another World is selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <WorldExperienceTargetSelector
        targets={targets}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Usable version for World A' }), {
      target: { value: 'world-version-a-2' },
    });
    const worldA = {
      globalWorldId: 'global-world-a',
      worldVersionId: 'world-version-a-2',
      label: 'World A',
      versionLabel: 'Published A2',
    };
    expect(onChange).toHaveBeenLastCalledWith(worldA);

    rerender(
      <WorldExperienceTargetSelector
        targets={targets}
        selected={worldA}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('World B').closest('button')!);
    const worldB = {
      globalWorldId: 'global-world-b',
      worldVersionId: 'world-version-b-1',
      label: 'World B',
      versionLabel: 'Published B1',
    };
    expect(onChange).toHaveBeenLastCalledWith(worldB);

    rerender(
      <WorldExperienceTargetSelector
        targets={targets}
        selected={worldB}
        loading={false}
        pending={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('World B').closest('button')!);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('distinguishes loading from an authoritative empty catalog', () => {
    const { rerender } = render(
      <WorldExperienceTargetSelector targets={[]} loading pending={false} onChange={vi.fn()} />,
    );

    expect(screen.getByText('Loading Worlds')).toBeTruthy();
    expect(screen.queryByText('No Worlds')).toBeNull();

    rerender(
      <WorldExperienceTargetSelector
        targets={[]}
        loading={false}
        pending={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('No Worlds')).toBeTruthy();
  });
});
