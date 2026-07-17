/**
 * SubtitleCueEditor Component
 * 字幕条目编辑器组件
 */

import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { SubtitleCue } from '../../types/subtitle';

// =============================================================================
// Types
// =============================================================================

interface SubtitleCueEditorProps {
  cue: SubtitleCue;
  onChange: (changes: Partial<SubtitleCue>) => void;
  onClose: () => void;
}

// =============================================================================
// SubtitleCueEditor Component
// =============================================================================

export const SubtitleCueEditor = memo(function SubtitleCueEditor({
  cue,
  onChange,
  onClose,
}: SubtitleCueEditorProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(cue.text);
  const [startTime, setStartTime] = useState(formatTimeInput(cue.startTime));
  const [endTime, setEndTime] = useState(formatTimeInput(cue.endTime));

  // Focus textarea on mount
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  // Parse time input (MM:SS.cc or SS.cc)
  function parseTimeInput(input: string): number | null {
    // Try MM:SS.cc format
    let match = input.match(/^(\d{1,2}):(\d{2})\.(\d{2})$/);
    if (match) {
      const [, mins, secs, cs] = match;
      return parseInt(mins, 10) * 60 + parseInt(secs, 10) + parseInt(cs, 10) / 100;
    }

    // Try SS.cc format
    match = input.match(/^(\d+)\.(\d{2})$/);
    if (match) {
      const [, secs, cs] = match;
      return parseInt(secs, 10) + parseInt(cs, 10) / 100;
    }

    // Try plain number
    const num = parseFloat(input);
    if (!isNaN(num)) return num;

    return null;
  }

  // Format time for input
  function formatTimeInput(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  const handleSave = useCallback(() => {
    const parsedStart = parseTimeInput(startTime);
    const parsedEnd = parseTimeInput(endTime);

    if (parsedStart === null || parsedEnd === null) {
      return;
    }

    if (parsedEnd <= parsedStart) {
      return;
    }

    onChange({
      text,
      startTime: parsedStart,
      endTime: parsedEnd,
    });
    onClose();
  }, [text, startTime, endTime, onChange, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleSave();
      }
    },
    [onClose, handleSave],
  );

  return (
    <div className="space-y-2" onKeyDown={handleKeyDown}>
      {/* Text input */}
      <textarea
        ref={textareaRef}
        className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded resize-none"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('subtitles.cue.text')}
      />

      {/* Time inputs */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-0.5">
            {t('subtitles.cue.startTime')}
          </label>
          <input
            type="text"
            className="w-full px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="00:00.00"
          />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-[var(--vscode-descriptionForeground)] block mb-0.5">
            {t('subtitles.cue.endTime')}
          </label>
          <input
            type="text"
            className="w-full px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="00:00.00"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          className="px-2 py-1 text-[10px] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded"
          onClick={onClose}
        >
          {t('common.cancel')}
        </button>
        <button
          className="px-2 py-1 text-[10px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded"
          onClick={handleSave}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  );
});

export default SubtitleCueEditor;
