import { SegmentedControl } from '@neko/ui';
import { useTranslation } from '@neko/ui/i18n/react';
import type {
  DesktopSceneTransitionIntent,
  DesktopWorkbenchSceneContext,
} from '@neko/host/desktop-scene-contract';

export type DesktopHomeExperienceMode = 'assistant' | 'workspace' | 'character' | 'world';

export interface DesktopHomeExperienceNavigationProjection {
  readonly selectedMode: Exclude<DesktopHomeExperienceMode, 'world'>;
}

export function projectDesktopHomeExperienceNavigation(
  context: DesktopWorkbenchSceneContext,
): DesktopHomeExperienceNavigationProjection | undefined {
  if (context.kind === 'agent' && context.scope.kind === 'unbound') {
    return { selectedMode: 'assistant' };
  }
  if (context.kind === 'project-management') return { selectedMode: 'workspace' };
  if (context.kind === 'character-management') return { selectedMode: 'character' };
  return undefined;
}

export function projectDesktopHomeExperienceIntent(
  mode: DesktopHomeExperienceMode,
): DesktopSceneTransitionIntent | undefined {
  switch (mode) {
    case 'assistant':
      return { kind: 'open-agent-entry' };
    case 'workspace':
      return { kind: 'open-project-management' };
    case 'character':
      return { kind: 'open-character-management' };
    case 'world':
      return undefined;
  }
}

export function DesktopHomeExperienceNavigation({
  disabled = false,
  onNavigate,
  projection,
}: {
  readonly disabled?: boolean;
  readonly onNavigate: (intent: DesktopSceneTransitionIntent) => void;
  readonly projection: DesktopHomeExperienceNavigationProjection;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <nav className="desktop-home-experience-navigation" aria-label={t('home.modeSelector')}>
      <SegmentedControl
        appearance="neutral"
        density="comfortable"
        label={t('home.modeSelector')}
        maxWidth={544}
        value={projection.selectedMode}
        onValueChange={(value) => {
          const mode = parseDesktopHomeExperienceMode(value);
          if (mode === projection.selectedMode) return;
          const intent = projectDesktopHomeExperienceIntent(mode);
          if (!intent) return;
          onNavigate(intent);
        }}
        options={[
          { value: 'assistant', label: t('home.assistant'), disabled },
          { value: 'workspace', label: t('home.workspace'), disabled },
          { value: 'character', label: t('home.character'), disabled },
          {
            value: 'world',
            label: t('home.world'),
            description: t('home.worldUnavailable'),
            disabled: true,
          },
        ]}
      />
    </nav>
  );
}

function parseDesktopHomeExperienceMode(value: string): DesktopHomeExperienceMode {
  if (
    value === 'assistant' ||
    value === 'workspace' ||
    value === 'character' ||
    value === 'world'
  ) {
    return value;
  }
  throw new Error(`Unsupported Desktop Home experience mode '${value}'.`);
}
