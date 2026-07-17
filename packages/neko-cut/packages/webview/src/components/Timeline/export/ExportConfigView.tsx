/**
 * ExportConfigView - Export configuration form UI.
 * Extracted from ExportPanel.tsx.
 */

import { useState } from 'react';
import { useTranslation } from '../../../i18n/I18nContext';
import { postMessage as vscodePostMessage } from '../../../utils/vscodeApi';
import type { ExportPreset, ExportPresetSettings } from '@neko/shared';
import type { ExportFormat, Resolution } from './exportConstants';
import {
  RESOLUTIONS,
  QUALITY_OPTIONS,
  FPS_OPTIONS,
  FORMAT_OPTIONS,
  VIDEO_CODEC_OPTIONS,
  AUDIO_CODEC_OPTIONS,
  CONTAINER_VIDEO_CODECS,
  CONTAINER_AUDIO_CODECS,
} from './exportConstants';

// =============================================================================
// HwBadge
// =============================================================================

/** Shows hardware encoder name (green) or software fallback (muted) */
function HwBadge({ encoder }: { encoder: string | null | undefined }) {
  if (encoder == null) {
    return (
      <span className="text-xs text-vscode-descriptionForeground opacity-60">💻 软件编码</span>
    );
  }
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded font-mono"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--vscode-charts-green) 15%, transparent)',
        color: 'var(--vscode-charts-green)',
      }}
    >
      ⚡ {encoder}
    </span>
  );
}

// =============================================================================
// ExportConfigView
// =============================================================================

interface ExportConfigViewProps {
  format: ExportFormat;
  videoCodec: string;
  audioCodec: string;
  resolution: Resolution;
  quality: 'low' | 'medium' | 'high';
  fps: number;
  audioBitrate: number;
  presets: ExportPreset[];
  selectedPresetId: string | null;
  hwCapabilities: Record<string, string | null> | null;
  hasGlobalExport: boolean;
  onFormatChange: (format: ExportFormat) => void;
  onVideoCodecChange: (codec: string) => void;
  onAudioCodecChange: (codec: string) => void;
  onResolutionChange: (res: Resolution) => void;
  onQualityChange: (quality: 'low' | 'medium' | 'high') => void;
  onFpsChange: (fps: number) => void;
  onAudioBitrateChange: (bitrate: number) => void;
  onPresetChange: (presetId: string) => void;
  onSelectedPresetIdChange: (id: string | null) => void;
  onExport: () => void;
  onClose: () => void;
}

export function ExportConfigView({
  format,
  videoCodec,
  audioCodec,
  resolution,
  quality,
  fps,
  audioBitrate,
  presets,
  selectedPresetId,
  hwCapabilities,
  hasGlobalExport,
  onFormatChange,
  onVideoCodecChange,
  onAudioCodecChange,
  onResolutionChange,
  onQualityChange,
  onFpsChange,
  onAudioBitrateChange,
  onPresetChange,
  onSelectedPresetIdChange,
  onExport,
  onClose,
}: ExportConfigViewProps) {
  const { t } = useTranslation();
  const [isNamingPreset, setIsNamingPreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--vscode-sideBar-background)] rounded-lg shadow-xl w-[480px] max-w-full border border-vscode-panel-border opacity-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-vscode-panel-border">
          <h2 className="text-lg font-semibold text-vscode-editor-foreground">导出视频</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-vscode-list-hoverBackground text-vscode-foreground"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Preset Selector */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">
              {t('export.preset.label')}
            </label>
            <div className="flex gap-2">
              <select
                value={selectedPresetId ?? ''}
                onChange={(e) => onPresetChange(e.target.value)}
                className="flex-1 px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
              >
                {presets.filter((p) => p.isBuiltin).length > 0 && (
                  <optgroup label={t('export.preset.builtin')}>
                    {presets
                      .filter((p) => p.isBuiltin)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                {presets.filter((p) => !p.isBuiltin).length > 0 && (
                  <optgroup label={t('export.preset.user')}>
                    {presets
                      .filter((p) => !p.isBuiltin)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                <option value="">{t('export.preset.custom')}</option>
              </select>

              {!isNamingPreset ? (
                <button
                  onClick={() => setIsNamingPreset(true)}
                  className="px-2 py-2 bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground rounded text-vscode-button-secondaryForeground transition-colors"
                  title="保存为预设"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                    />
                  </svg>
                </button>
              ) : (
                <div className="flex gap-1 items-center">
                  <input
                    autoFocus
                    type="text"
                    value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && presetNameInput.trim()) {
                        const settings: ExportPresetSettings = {
                          format,
                          videoCodec,
                          audioCodec,
                          width: resolution.width,
                          height: resolution.height,
                          fps,
                          quality,
                          audioBitrate,
                        };
                        vscodePostMessage({
                          type: 'preset:save',
                          name: presetNameInput.trim(),
                          settings,
                        });
                        setPresetNameInput('');
                        setIsNamingPreset(false);
                      } else if (e.key === 'Escape') {
                        setPresetNameInput('');
                        setIsNamingPreset(false);
                      }
                    }}
                    placeholder="预设名称"
                    className="w-32 px-2 py-1 bg-vscode-input-background border border-vscode-focusBorder rounded text-vscode-input-foreground text-sm focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      setPresetNameInput('');
                      setIsNamingPreset(false);
                    }}
                    className="px-1 py-1 text-vscode-foreground opacity-60 hover:opacity-100"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Global Export Warning */}
          {hasGlobalExport && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-start gap-2">
              <svg
                className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <div className="text-sm font-medium text-blue-400">有导出任务正在进行</div>
                <div className="text-xs text-vscode-descriptionForeground mt-1">
                  新的导出任务将自动加入队列，当前任务完成后依次执行。
                </div>
              </div>
            </div>
          )}

          {/* Container Format */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">
              容器格式
            </label>
            <select
              value={format}
              onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Video Codec */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">
              视频编码
            </label>
            <select
              value={videoCodec}
              onChange={(e) => {
                onSelectedPresetIdChange(null);
                onVideoCodecChange(e.target.value);
              }}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {VIDEO_CODEC_OPTIONS.filter((opt) =>
                (CONTAINER_VIDEO_CODECS[format] ?? []).includes(opt.value),
              ).map((opt) => {
                const hw = hwCapabilities?.[opt.value];
                const tag = hwCapabilities == null ? '' : hw != null ? '  ⚡ 硬件' : '  💻 软件';
                return (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                    {tag}
                  </option>
                );
              })}
            </select>
            <div className="mt-1 h-5 flex items-center">
              {hwCapabilities === null ? (
                <span className="text-xs text-vscode-descriptionForeground opacity-40">
                  检测硬件加速...
                </span>
              ) : (
                <HwBadge encoder={hwCapabilities[videoCodec]} />
              )}
            </div>
          </div>

          {/* Audio Codec */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">
              音频编码
            </label>
            <select
              value={audioCodec}
              onChange={(e) => {
                onSelectedPresetIdChange(null);
                onAudioCodecChange(e.target.value);
              }}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {AUDIO_CODEC_OPTIONS.filter((opt) =>
                (CONTAINER_AUDIO_CODECS[format] ?? []).includes(opt.value),
              ).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Resolution */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">分辨率</label>
            <select
              value={`${resolution.width}x${resolution.height}`}
              onChange={(e) => {
                onSelectedPresetIdChange(null);
                const [w, h] = e.target.value.split('x').map(Number);
                const res = RESOLUTIONS.find((r) => r.width === w && r.height === h);
                if (res) onResolutionChange({ ...res });
              }}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {RESOLUTIONS.map((res) => (
                <option key={res.label} value={`${res.width}x${res.height}`}>
                  {res.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quality */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">质量</label>
            <select
              value={quality}
              onChange={(e) => {
                onSelectedPresetIdChange(null);
                onQualityChange(e.target.value as 'low' | 'medium' | 'high');
              }}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {QUALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Audio Bitrate */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">
              音频比特率
            </label>
            <select
              value={audioBitrate}
              onChange={(e) => {
                onSelectedPresetIdChange(null);
                onAudioBitrateChange(Number(e.target.value));
              }}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              <option value={96000}>96 kbps</option>
              <option value={128000}>128 kbps</option>
              <option value={192000}>192 kbps</option>
              <option value={256000}>256 kbps</option>
              <option value={320000}>320 kbps</option>
            </select>
          </div>

          {/* FPS */}
          <div>
            <label className="block text-sm font-medium text-vscode-foreground mb-2">
              帧率: {fps} FPS
            </label>
            <select
              value={fps}
              onChange={(e) => {
                onSelectedPresetIdChange(null);
                onFpsChange(Number(e.target.value));
              }}
              className="w-full px-3 py-2 bg-vscode-input-background border border-vscode-input-border rounded text-vscode-input-foreground focus:outline-none focus:border-vscode-focusBorder"
            >
              {FPS_OPTIONS.map((fpsValue) => (
                <option key={fpsValue} value={fpsValue}>
                  {fpsValue} FPS
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-vscode-panel-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground rounded text-vscode-button-secondaryForeground transition-colors"
          >
            关闭
          </button>
          <button
            onClick={onExport}
            className="px-4 py-2 bg-vscode-button-background hover:bg-vscode-button-hoverBackground rounded text-vscode-button-foreground transition-colors"
          >
            {hasGlobalExport ? '加入队列' : '导出'}
          </button>
        </div>
      </div>
    </div>
  );
}
