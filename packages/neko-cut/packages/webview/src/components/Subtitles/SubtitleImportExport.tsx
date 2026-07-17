/**
 * SubtitleImportExport Component
 * 字幕导入导出组件
 */

import { memo, useState, useCallback, useRef } from 'react';
import { useTranslation } from '../../i18n/I18nContext';
import type { SubtitleTrack, SubtitleFormat } from '../../types/subtitle';
import { importSubtitles, exportSubtitles, detectSubtitleFormat } from '../../utils/subtitleParser';

// =============================================================================
// Types
// =============================================================================

interface SubtitleImportExportProps {
  tracks: SubtitleTrack[];
  onImport: (track: SubtitleTrack) => void;
  selectedTrackId: string | null;
}

type ModalType = 'import' | 'export' | null;

// =============================================================================
// SubtitleImportExport Component
// =============================================================================

export const SubtitleImportExport = memo(function SubtitleImportExport({
  tracks,
  onImport,
  selectedTrackId,
}: SubtitleImportExportProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [exportFormat, setExportFormat] = useState<SubtitleFormat>('srt');
  const [includeStyles, setIncludeStyles] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Get selected track
  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);

  // ==========================================================================
  // Import
  // ==========================================================================

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (!content) {
          setMessage({ type: 'error', text: t('subtitles.io.importError') });
          return;
        }

        const format = detectSubtitleFormat(content);
        if (!format) {
          setMessage({ type: 'error', text: t('subtitles.io.unsupportedFormat') });
          return;
        }

        const track = importSubtitles(content, { format });
        if (track) {
          // Use filename as track name (without extension)
          track.name = file.name.replace(/\.[^.]+$/, '');
          onImport(track);
          setMessage({ type: 'success', text: t('subtitles.io.importSuccess') });
        } else {
          setMessage({ type: 'error', text: t('subtitles.io.importError') });
        }
      };

      reader.onerror = () => {
        setMessage({ type: 'error', text: t('subtitles.io.importError') });
      };

      reader.readAsText(file);

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onImport, t],
  );

  // ==========================================================================
  // Export
  // ==========================================================================

  const handleExport = useCallback(() => {
    if (!selectedTrack) return;

    const content = exportSubtitles(selectedTrack, {
      format: exportFormat,
      includeStyles,
    });

    // Create download
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedTrack.name}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setMessage({ type: 'success', text: t('subtitles.io.exportSuccess') });
    setModalType(null);
  }, [selectedTrack, exportFormat, includeStyles, t]);

  // ==========================================================================
  // Render
  // ==========================================================================

  // Auto-dismiss message after 3 seconds
  if (message) {
    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".srt,.vtt,.ass,.ssa,.json"
        onChange={handleFileSelect}
      />

      {/* Import/Export buttons */}
      <div className="flex items-center gap-2">
        <button
          className="px-2 py-1 text-[10px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded flex items-center gap-1"
          onClick={handleImportClick}
          title={t('subtitles.importSubtitles')}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          {t('subtitles.io.import')}
        </button>

        <button
          className="px-2 py-1 text-[10px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => setModalType('export')}
          disabled={!selectedTrack || selectedTrack.cues.length === 0}
          title={t('subtitles.exportSubtitles')}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          {t('subtitles.io.export')}
        </button>
      </div>

      {/* Message toast */}
      {message && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-[12px] z-50 ${
            message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Export modal */}
      {modalType === 'export' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--vscode-editor-background)] rounded-lg shadow-xl p-4 w-80">
            <h3 className="text-[14px] font-medium text-[var(--vscode-foreground)] mb-4">
              {t('subtitles.exportSubtitles')}
            </h3>

            {/* Format selector */}
            <div className="mb-4">
              <label className="text-[11px] text-[var(--vscode-descriptionForeground)] block mb-1">
                {t('subtitles.io.selectFormat')}
              </label>
              <select
                className="w-full px-2 py-1.5 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as SubtitleFormat)}
              >
                <option value="srt">{t('subtitles.format.srt')}</option>
                <option value="vtt">{t('subtitles.format.vtt')}</option>
                <option value="ass">{t('subtitles.format.ass')}</option>
                <option value="json">{t('subtitles.format.json')}</option>
              </select>
            </div>

            {/* Include styles option (for ASS/JSON) */}
            {(exportFormat === 'ass' || exportFormat === 'json') && (
              <div className="mb-4">
                <label className="flex items-center gap-2 text-[11px] text-[var(--vscode-foreground)]">
                  <input
                    type="checkbox"
                    checked={includeStyles}
                    onChange={(e) => setIncludeStyles(e.target.checked)}
                  />
                  {t('subtitles.io.includeStyles')}
                </label>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1.5 text-[11px] text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded"
                onClick={() => setModalType(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="px-3 py-1.5 text-[11px] text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] rounded"
                onClick={handleExport}
              >
                {t('subtitles.io.export')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default SubtitleImportExport;
