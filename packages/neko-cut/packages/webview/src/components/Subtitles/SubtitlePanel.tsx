/**
 * SubtitlePanel Component
 * 字幕面板组件 - 字幕管理和编辑
 */

import { memo, useCallback, useState, useMemo, useEffect } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { SubtitleTrack, SubtitleCue, SubtitleStyle } from '../../types/subtitle';
import { createSubtitleTrack, createSubtitleCue, SUBTITLE_TEMPLATES } from '../../types/subtitle';
import { SubtitleCueEditor } from './SubtitleCueEditor';
import { SubtitleStyleEditor } from './SubtitleStyleEditor';

// =============================================================================
// Types
// =============================================================================

interface SubtitlePanelProps {
  tracks: SubtitleTrack[];
  currentTime: number;
  duration: number;
  onTracksChange: (tracks: SubtitleTrack[]) => void;
}

type TabType = 'cues' | 'style' | 'templates';

// =============================================================================
// SubtitlePanel Component
// =============================================================================

export const SubtitlePanel = memo(function SubtitlePanel({
  tracks,
  currentTime,
  duration,
  onTracksChange,
}: SubtitlePanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('cues');
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    tracks.length > 0 ? tracks[0].id : null,
  );
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);

  // Get current track
  const currentTrack = useMemo(() => {
    return tracks.find((t) => t.id === selectedTrackId) || null;
  }, [tracks, selectedTrackId]);

  // Get current cue at playhead position
  const currentCue = useMemo(() => {
    if (!currentTrack) return null;
    return (
      currentTrack.cues.find((cue) => currentTime >= cue.startTime && currentTime < cue.endTime) ||
      null
    );
  }, [currentTrack, currentTime]);

  useEffect(() => {
    if (tracks.length === 0) {
      setSelectedTrackId(null);
      setSelectedCueId(null);
      setEditingCueId(null);
      return;
    }

    if (!selectedTrackId || !tracks.some((track) => track.id === selectedTrackId)) {
      setSelectedTrackId(tracks[0]?.id ?? null);
    }
  }, [tracks, selectedTrackId]);

  useEffect(() => {
    if (!currentTrack) {
      setSelectedCueId(null);
      setEditingCueId(null);
      return;
    }

    if (selectedCueId && !currentTrack.cues.some((cue) => cue.id === selectedCueId)) {
      setSelectedCueId(null);
    }

    if (editingCueId && !currentTrack.cues.some((cue) => cue.id === editingCueId)) {
      setEditingCueId(null);
    }
  }, [currentTrack, selectedCueId, editingCueId]);

  // ==========================================================================
  // Track Management
  // ==========================================================================

  const handleAddTrack = useCallback(() => {
    const newTrack = createSubtitleTrack(`${t('subtitles.track')} ${tracks.length + 1}`, 'en');
    const newTracks = [...tracks, newTrack];
    onTracksChange(newTracks);
    setSelectedTrackId(newTrack.id);
  }, [tracks, onTracksChange, t]);

  const handleRemoveTrack = useCallback(
    (trackId: string) => {
      const newTracks = tracks.filter((t) => t.id !== trackId);
      onTracksChange(newTracks);
      if (selectedTrackId === trackId) {
        setSelectedTrackId(newTracks.length > 0 ? newTracks[0].id : null);
      }
    },
    [tracks, onTracksChange, selectedTrackId],
  );

  const handleTrackChange = useCallback(
    (trackId: string, changes: Partial<SubtitleTrack>) => {
      const newTracks = tracks.map((t) => (t.id === trackId ? { ...t, ...changes } : t));
      onTracksChange(newTracks);
    },
    [tracks, onTracksChange],
  );

  // ==========================================================================
  // Cue Management
  // ==========================================================================

  const handleAddCue = useCallback(() => {
    if (!currentTrack) return;

    // Default duration for new cue
    const cueDuration = 3;
    const startTime = currentTime;
    const endTime = Math.min(startTime + cueDuration, duration);

    const newCue = createSubtitleCue(startTime, endTime, '');
    const newCues = [...currentTrack.cues, newCue].sort((a, b) => a.startTime - b.startTime);

    handleTrackChange(currentTrack.id, { cues: newCues });
    setSelectedCueId(newCue.id);
    setEditingCueId(newCue.id);
  }, [currentTrack, currentTime, duration, handleTrackChange]);

  const handleRemoveCue = useCallback(
    (cueId: string) => {
      if (!currentTrack) return;

      const newCues = currentTrack.cues.filter((c) => c.id !== cueId);
      handleTrackChange(currentTrack.id, { cues: newCues });

      if (selectedCueId === cueId) {
        setSelectedCueId(null);
      }
      if (editingCueId === cueId) {
        setEditingCueId(null);
      }
    },
    [currentTrack, handleTrackChange, selectedCueId, editingCueId],
  );

  const handleCueChange = useCallback(
    (cueId: string, changes: Partial<SubtitleCue>) => {
      if (!currentTrack) return;

      const newCues = currentTrack.cues
        .map((c) => (c.id === cueId ? { ...c, ...changes } : c))
        .sort((a, b) => a.startTime - b.startTime);

      handleTrackChange(currentTrack.id, { cues: newCues });
    },
    [currentTrack, handleTrackChange],
  );

  const handleDuplicateCue = useCallback(
    (cueId: string) => {
      if (!currentTrack) return;

      const originalCue = currentTrack.cues.find((c) => c.id === cueId);
      if (!originalCue) return;

      const newCue = createSubtitleCue(
        originalCue.endTime,
        originalCue.endTime + (originalCue.endTime - originalCue.startTime),
        originalCue.text,
      );
      newCue.style = originalCue.style;
      newCue.speaker = originalCue.speaker;

      const newCues = [...currentTrack.cues, newCue].sort((a, b) => a.startTime - b.startTime);
      handleTrackChange(currentTrack.id, { cues: newCues });
      setSelectedCueId(newCue.id);
    },
    [currentTrack, handleTrackChange],
  );

  // ==========================================================================
  // Style Management
  // ==========================================================================

  const handleStyleChange = useCallback(
    (style: SubtitleStyle) => {
      if (!currentTrack) return;
      handleTrackChange(currentTrack.id, { style });
    },
    [currentTrack, handleTrackChange],
  );

  const handleApplyTemplate = useCallback(
    (templateId: string) => {
      if (!currentTrack) return;

      const template = SUBTITLE_TEMPLATES.find((t) => t.id === templateId);
      if (template) {
        handleTrackChange(currentTrack.id, { style: { ...template.style } });
      }
    },
    [currentTrack, handleTrackChange],
  );

  // ==========================================================================
  // Render
  // ==========================================================================

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-full flex flex-col bg-[var(--vscode-editor-background)]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] flex items-center justify-between">
        <h3 className="text-[12px] font-medium text-[var(--vscode-foreground)]">
          {t('subtitles.title')}
        </h3>
        <div className="flex items-center gap-1">
          <button
            className="p-1 text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded"
            onClick={handleAddTrack}
            title={t('subtitles.addTrack')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Track Selector */}
      {tracks.length > 0 && (
        <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)] flex items-center gap-2">
          <select
            className="flex-1 px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            value={selectedTrackId || ''}
            onChange={(e) => setSelectedTrackId(e.target.value)}
          >
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name} ({track.language})
              </option>
            ))}
          </select>
          <button
            className="p-1 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded"
            onClick={() => selectedTrackId && handleRemoveTrack(selectedTrackId)}
            title={t('subtitles.removeTrack')}
            disabled={!selectedTrackId}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-[var(--vscode-panel-border)]">
        {(['cues', 'style', 'templates'] as TabType[]).map((tab) => (
          <button
            key={tab}
            className={`flex-1 px-3 py-1.5 text-[11px] transition-colors ${
              activeTab === tab
                ? 'text-[var(--vscode-foreground)] border-b-2 border-[var(--vscode-focusBorder)]'
                : 'text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'cues' && t('subtitles.cue.text')}
            {tab === 'style' && t('subtitles.style.title')}
            {tab === 'templates' && t('subtitles.template.title')}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tracks.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p className="text-[12px] text-[var(--vscode-descriptionForeground)] mb-4">
              {t('subtitles.noSubtitles')}
            </p>
            <button
              className="px-3 py-1.5 text-[11px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded"
              onClick={handleAddTrack}
            >
              {t('subtitles.addTrack')}
            </button>
          </div>
        ) : activeTab === 'cues' ? (
          // Cues list
          <div className="p-2">
            {/* Add cue button */}
            <button
              className="w-full mb-2 px-3 py-1.5 text-[11px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded flex items-center justify-center gap-1"
              onClick={handleAddCue}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {t('subtitles.cue.add')}
            </button>

            {/* Cue list */}
            {currentTrack && currentTrack.cues.length === 0 ? (
              <p className="text-[11px] text-[var(--vscode-descriptionForeground)] text-center py-4">
                {t('subtitles.noCues')}
              </p>
            ) : (
              <div className="space-y-1">
                {currentTrack?.cues.map((cue) => (
                  <div
                    key={cue.id}
                    className={`p-2 rounded cursor-pointer transition-colors ${
                      selectedCueId === cue.id
                        ? 'bg-[var(--vscode-list-activeSelectionBackground)]'
                        : cue === currentCue
                          ? 'bg-[var(--vscode-list-hoverBackground)]'
                          : 'hover:bg-[var(--vscode-list-hoverBackground)]'
                    }`}
                    onClick={() => setSelectedCueId(cue.id)}
                    onDoubleClick={() => setEditingCueId(cue.id)}
                  >
                    {editingCueId === cue.id ? (
                      <SubtitleCueEditor
                        cue={cue}
                        onChange={(changes) => handleCueChange(cue.id, changes)}
                        onClose={() => setEditingCueId(null)}
                      />
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                            {formatTime(cue.startTime)} - {formatTime(cue.endTime)}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateCue(cue.id);
                              }}
                              title={t('subtitles.cue.duplicate')}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                            <button
                              className="p-0.5 text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-errorForeground)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveCue(cue.id);
                              }}
                              title={t('subtitles.cue.remove')}
                            >
                              <svg
                                className="w-3 h-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-[var(--vscode-foreground)] line-clamp-2">
                          {cue.text || (
                            <span className="italic text-[var(--vscode-descriptionForeground)]">
                              (empty)
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'style' ? (
          // Style editor
          currentTrack && (
            <SubtitleStyleEditor style={currentTrack.style} onChange={handleStyleChange} />
          )
        ) : (
          // Templates
          <div className="p-2 grid grid-cols-2 gap-2">
            {SUBTITLE_TEMPLATES.map((template) => (
              <button
                key={template.id}
                className="p-3 rounded border border-[var(--vscode-panel-border)] hover:border-[var(--vscode-focusBorder)] hover:bg-[var(--vscode-list-hoverBackground)] text-left transition-colors"
                onClick={() => handleApplyTemplate(template.id)}
              >
                <div className="text-[11px] font-medium text-[var(--vscode-foreground)] mb-1">
                  {t(`subtitles.template.${template.id}`) || template.name}
                </div>
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {template.description}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default SubtitlePanel;
