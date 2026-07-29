/**
 * ViewTabs - View mode switcher for audio player
 *
 * Displays cover/lyrics/waveform/spectrum tab icons below the visual area.
 */

import { useTranslation } from '../i18n/I18nContext';
import { CodeIcon, FileIcon, LayersIcon, VolumeIcon } from '@neko/ui/icons';
import { MacTabs, type MacTab } from '../shared/MacTabs';
import type { ViewMode } from './AudioControls';

interface ViewTabsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewTabs({ viewMode, onViewModeChange }: ViewTabsProps) {
  const { t } = useTranslation();

  const tabs: MacTab[] = [
    {
      id: 'cover',
      title: t('preview.audio.viewCover'),
      icon: <FileIcon size={14} />,
    },
    {
      id: 'lyrics',
      title: t('preview.audio.viewLyrics'),
      icon: <VolumeIcon size={14} />,
    },
    {
      id: 'waveform',
      title: t('preview.audio.viewWaveform'),
      icon: <LayersIcon size={14} />,
    },
    {
      id: 'spectrum',
      title: t('preview.audio.viewSpectrum'),
      icon: <CodeIcon size={14} />,
    },
  ];

  return (
    <div className="shrink-0 pt-3 pb-1">
      <MacTabs
        tabs={tabs}
        activeTab={viewMode}
        onChange={(id) => onViewModeChange(id as ViewMode)}
      />
    </div>
  );
}
