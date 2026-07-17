/**
 * useTimelineContextMenu Hook
 * Manages timeline context menu state and menu items generation
 */

import { useCallback, useState } from 'react';
import { useEditorStore } from '../stores/editor-store';
import { useTranslation } from '../i18n/I18nContext';
import type { MenuItem } from '../components/ContextMenu';
import type { TimelineTrack } from '../types';
import { buildMenuSection, type MenuItem as SharedMenuItem } from '@neko/ui/primitives';

export interface ContextMenuState {
  x: number;
  y: number;
  type: 'track' | 'timeline';
  trackId?: string;
  trackIndex?: number;
}

export interface TimelineContextMenuOptions {
  tracks: TimelineTrack[];
  currentTime: number;
  onToggleMute: (trackId: string, currentMuted: boolean) => void;
  onToggleLocked: (trackId: string) => void;
  onToggleHidden: (trackId: string) => void;
  onDeleteTrack: (trackId: string) => void;
  onSendToAgent?: () => void;
}

/** Convert shared MenuItem[] (discriminated union) to neko-cut MenuItem[] (optional bool separator) */
function fromSharedItems(items: readonly SharedMenuItem[]): MenuItem[] {
  return items.map((item): MenuItem => {
    if ('separator' in item && item.separator === true) {
      return { label: '', onClick: () => {}, separator: true };
    }
    const action = item as Exclude<SharedMenuItem, { separator: true }>;
    return {
      label: action.label,
      icon: action.icon,
      onClick: action.onClick,
      disabled: action.disabled,
      danger: action.danger,
      shortcut: action.shortcut,
      submenu: action.submenu ? fromSharedItems(action.submenu) : undefined,
    };
  });
}

export function useTimelineContextMenu({
  tracks,
  currentTime,
  onToggleMute,
  onToggleLocked,
  onToggleHidden,
  onDeleteTrack,
  onSendToAgent,
}: TimelineContextMenuOptions) {
  const { t } = useTranslation();

  // Get actions from store
  const {
    addTrack,
    pasteAtTime,
    clipboard,
    setSelectedElements,
    snappingEnabled,
    rippleEditingEnabled,
    toggleSnapping,
    toggleRippleEditing,
    aiAutoEdit,
    aiMatchMusic,
    aiRemoveSilence,
  } = useEditorStore();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Handle track label right-click
  const handleTrackLabelContextMenu = useCallback(
    (e: React.MouseEvent, trackId: string, trackIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'track',
        trackId,
        trackIndex,
      });
    },
    [],
  );

  // Handle timeline background right-click
  const handleTimelineContextMenu = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.timeline-element')) return;
    if ((e.target as HTMLElement).closest('.track-label')) return;
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      type: 'timeline',
    });
  }, []);

  // Close context menu
  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Generate track context menu items
  const getTrackContextMenuItems = useCallback(
    (trackId: string): MenuItem[] => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) return [];

      return [
        {
          label: track.hidden ? t('timeline.track.show') : t('timeline.track.hide'),
          onClick: () => onToggleHidden(trackId),
        },
        {
          label: track.locked ? t('timeline.track.unlock') : t('timeline.track.lock'),
          onClick: () => onToggleLocked(trackId),
        },
        {
          label: track.muted
            ? t('timeline.contextMenu.unmuteTrack')
            : t('timeline.contextMenu.muteTrack'),
          onClick: () => onToggleMute(trackId, track.muted || false),
        },
        {
          label: '',
          onClick: () => {},
          separator: true,
        },
        {
          label: t('timeline.contextMenu.deleteTrack'),
          onClick: () => onDeleteTrack(trackId),
        },
      ];
    },
    [tracks, onToggleMute, onToggleLocked, onToggleHidden, onDeleteTrack, t],
  );

  // Generate timeline context menu items
  const getTimelineContextMenuItems = useCallback((): MenuItem[] => {
    return [
      // Add Track submenu
      {
        label: t('timeline.contextMenu.addTrack'),
        onClick: () => {},
        submenu: [
          {
            label: t('timeline.contextMenu.addMediaTrack'),
            onClick: () => addTrack('media'),
          },
          {
            label: t('timeline.contextMenu.addAudioTrack'),
            onClick: () => addTrack('audio'),
          },
          {
            label: t('timeline.contextMenu.addTextTrack'),
            onClick: () => addTrack('text'),
          },
          {
            label: t('timeline.contextMenu.addSubtitleTrack'),
            onClick: () => addTrack('subtitle'),
          },
          {
            label: t('timeline.contextMenu.addShapeTrack'),
            onClick: () => addTrack('shape'),
          },
        ],
      },
      {
        label: '',
        onClick: () => {},
        separator: true,
      },
      // Edit operations
      {
        label: t('timeline.contextMenu.paste'),
        shortcut: '⌘V',
        onClick: () => pasteAtTime(currentTime),
        disabled: !clipboard || clipboard.items.length === 0,
      },
      {
        label: t('timeline.contextMenu.selectAll'),
        shortcut: '⌘A',
        onClick: () => {
          const allElements: Array<{ trackId: string; elementId: string }> = [];
          tracks.forEach((track) => {
            track.elements.forEach((element) => {
              allElements.push({ trackId: track.id, elementId: element.id });
            });
          });
          if (allElements.length > 0) {
            setSelectedElements(allElements);
          }
        },
        disabled: tracks.length === 0,
      },
      {
        label: '',
        onClick: () => {},
        separator: true,
      },
      // View options
      {
        label: snappingEnabled
          ? t('timeline.contextMenu.disableSnapping')
          : t('timeline.contextMenu.enableSnapping'),
        onClick: () => toggleSnapping(),
      },
      {
        label: rippleEditingEnabled
          ? t('timeline.contextMenu.disableRipple')
          : t('timeline.contextMenu.enableRipple'),
        onClick: () => toggleRippleEditing(),
      },
      {
        label: '',
        onClick: () => {},
        separator: true,
      },
      // AI Operations — unified shell
      ...fromSharedItems(
        buildMenuSection({
          actions: [
            {
              id: 'ai-auto-edit',
              label: t('timeline.contextMenu.aiAutoEdit'),
              icon: '✂️',
              onClick: aiAutoEdit,
            },
            {
              id: 'ai-match-music',
              label: t('timeline.contextMenu.aiMatchMusic'),
              icon: '🎵',
              onClick: aiMatchMusic,
            },
            {
              id: 'ai-remove-silence',
              label: t('timeline.contextMenu.aiRemoveSilence'),
              icon: '🔇',
              onClick: aiRemoveSilence,
            },
          ],
          trailingActions: onSendToAgent
            ? [
                {
                  id: 'send-to-agent',
                  label: t('timeline.contextMenu.sendToAgent'),
                  icon: '🤖',
                  onClick: onSendToAgent,
                },
              ]
            : undefined,
        }),
      ),
    ];
  }, [
    addTrack,
    pasteAtTime,
    currentTime,
    clipboard,
    tracks,
    setSelectedElements,
    snappingEnabled,
    rippleEditingEnabled,
    toggleSnapping,
    toggleRippleEditing,
    t,
    aiAutoEdit,
    aiMatchMusic,
    aiRemoveSilence,
    onSendToAgent,
  ]);

  // Get menu items based on context menu type
  const getContextMenuItems = useCallback((): MenuItem[] => {
    if (!contextMenu) return [];
    if (contextMenu.type === 'track' && contextMenu.trackId) {
      return getTrackContextMenuItems(contextMenu.trackId);
    }
    return getTimelineContextMenuItems();
  }, [contextMenu, getTrackContextMenuItems, getTimelineContextMenuItems]);

  return {
    contextMenu,
    handleTrackLabelContextMenu,
    handleTimelineContextMenu,
    closeContextMenu,
    getContextMenuItems,
  };
}
