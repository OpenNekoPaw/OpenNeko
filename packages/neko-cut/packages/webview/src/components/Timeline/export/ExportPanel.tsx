/**
 * ExportPanel - Export workflow orchestrator.
 * Manages state, message handling, and delegates to ExportProgressView / ExportConfigView.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../../../stores/editor-store';
import { useTranslation } from '../../../i18n/I18nContext';
import { useToast } from '../../Toast';
import { useVSCodeMessaging } from '../../../hooks/useVSCodeMessaging';
import { postMessage as vscodePostMessage } from '../../../utils/vscodeApi';
import type { ExportPreset } from '@neko/shared';
import type { ExportFormat, ExportProgress, ExportPanelProps, Resolution } from './exportConstants';
import {
  RESOLUTIONS,
  CONTAINER_VIDEO_CODECS,
  CONTAINER_AUDIO_CODECS,
  DEFAULT_CODECS,
} from './exportConstants';
import { validateProjectMediaFiles, getStageLabel } from './exportUtils';
import { ExportProgressView } from './ExportProgressView';
import { ExportConfigView } from './ExportConfigView';

export function ExportPanel({ isOpen, onClose }: ExportPanelProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { project } = useEditorStore();
  const { sendMessage, sendExportProgress } = useVSCodeMessaging();

  // Export state ref
  const exportRef = useRef<{ isActive: boolean }>({ isActive: false });

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [format, setFormat] = useState<ExportFormat>('mp4');
  const [videoCodec, setVideoCodec] = useState('h264');
  const [audioCodec, setAudioCodec] = useState('aac');
  const [resolution, setResolution] = useState<Resolution>({ ...RESOLUTIONS[2] });
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [fps, setFps] = useState(project?.fps || 30);
  const [audioBitrate, setAudioBitrate] = useState(192000);
  const [isExporting, setIsExporting] = useState(false);

  // Progress state
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  // Global export status
  const [hasGlobalExport, setHasGlobalExport] = useState(false);
  const [queueStatus, setQueueStatus] = useState<{ active: number; pending: number }>({
    active: 0,
    pending: 0,
  });
  const [presets, setPresets] = useState<ExportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [hwCapabilities, setHwCapabilities] = useState<Record<string, string | null> | null>(null);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  // Listen for export progress from Extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'export:globalStatus':
          setHasGlobalExport(message.hasActiveExport);
          break;

        case 'export:queueStatus':
          setQueueStatus({ active: message.active as number, pending: message.pending as number });
          break;

        case 'export:progress':
          if (exportRef.current.isActive) {
            setExportProgress(message.progress);
            sendExportProgress({
              isExporting: true,
              percent: message.progress.percent,
              message: message.progress.message || getStageLabel(message.progress.stage),
              currentFrame: message.progress.currentFrame,
              totalFrames: message.progress.totalFrames,
              currentFps: message.progress.currentFps,
              estimatedTimeRemaining: message.progress.estimatedTimeRemaining,
            });
          }
          break;

        case 'export:completed':
          if (exportRef.current.isActive) {
            setIsExporting(false);
            setExportProgress(null);
            sendExportProgress({ isExporting: false, percent: 0, message: '' });
            exportRef.current.isActive = false;
            showToast(t('export.success.completed'), 'success');
          }
          break;

        case 'export:error':
          if (exportRef.current.isActive) {
            setIsExporting(false);
            setExportProgress(null);
            sendExportProgress({ isExporting: false, percent: 0, message: '' });
            exportRef.current.isActive = false;
            showToast(
              t('export.errors.exportFailed', { error: message.error || 'Unknown error' }),
              'error',
              5000,
            );
          }
          break;

        case 'export:cancelled':
          if (exportRef.current.isActive) {
            setIsExporting(false);
            setExportProgress(null);
            sendExportProgress({ isExporting: false, percent: 0, message: '' });
            exportRef.current.isActive = false;
            showToast(t('export.cancelled'), 'info');
          }
          break;

        case 'export:activeExport':
          // Resume tracking a background export (editor was reopened during export)
          exportRef.current.isActive = true;
          setIsExporting(true);
          setExportProgress(message.progress);
          break;

        case 'preset:list':
          setPresets(message.presets as ExportPreset[]);
          break;

        case 'export:hwCapabilities':
          setHwCapabilities(message.codecs as Record<string, string | null>);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    sendMessage({ type: 'export:queryGlobalStatus' });
    sendMessage({ type: 'preset:list' });
    sendMessage({ type: 'export:queryHwCapabilities' });

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [sendMessage, sendExportProgress, showToast, t]);

  // Sync FPS from project
  useEffect(() => {
    if (project?.fps) {
      setFps(project.fps);
    }
  }, [project?.fps]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleFormatChange = useCallback(
    (newFormat: ExportFormat) => {
      setSelectedPresetId(null);
      setFormat(newFormat);
      const defaults = DEFAULT_CODECS[newFormat];
      const videoOptions = CONTAINER_VIDEO_CODECS[newFormat] ?? [];
      const audioOptions = CONTAINER_AUDIO_CODECS[newFormat] ?? [];
      if (!videoOptions.includes(videoCodec)) {
        setVideoCodec(defaults?.video ?? videoOptions[0] ?? 'h264');
      }
      if (!audioOptions.includes(audioCodec)) {
        setAudioCodec(defaults?.audio ?? audioOptions[0] ?? 'aac');
      }
    },
    [videoCodec, audioCodec],
  );

  const applyPreset = useCallback((preset: ExportPreset) => {
    const s = preset.settings;
    const newFormat = s.format as ExportFormat;
    setFormat(newFormat);
    setVideoCodec(s.videoCodec);
    setAudioCodec(s.audioCodec);
    const res = RESOLUTIONS.find((r) => r.width === s.width && r.height === s.height) ?? {
      label: `${s.width}x${s.height}`,
      width: s.width,
      height: s.height,
    };
    setResolution(res);
    setQuality(s.quality);
    setFps(s.fps);
    setAudioBitrate(s.audioBitrate);
    setSelectedPresetId(preset.id);
  }, []);

  const handlePresetChange = useCallback(
    (presetId: string) => {
      if (presetId === '') {
        setSelectedPresetId(null);
        return;
      }
      const preset = presets.find((p) => p.id === presetId);
      if (preset) applyPreset(preset);
    },
    [presets, applyPreset],
  );

  const selectExportPath = useCallback(async (): Promise<string | null> => {
    const ext = format;
    const filename = `${project?.name || 'export'}.${ext}`;

    return new Promise((resolve) => {
      const messageHandler = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'exportPathSelected') {
          window.removeEventListener('message', messageHandler);
          if (message.success && message.path) {
            resolve(message.path);
          } else {
            resolve(null);
          }
        }
      };
      window.addEventListener('message', messageHandler);

      vscodePostMessage({
        type: 'selectExportPath',
        filename,
        format: ext,
      });

      setTimeout(() => {
        window.removeEventListener('message', messageHandler);
        resolve(null);
      }, 60000);
    });
  }, [format, project?.name]);

  const handleExport = useCallback(async () => {
    if (!project) {
      showToast(t('export.errors.noProject'), 'error');
      return;
    }

    // Step 1: Select export path
    const exportPath = await selectExportPath();
    if (!exportPath) {
      return;
    }

    // Step 2: Validate media files
    const missingFiles = await validateProjectMediaFiles(project);
    if (missingFiles.length > 0) {
      const fileList = missingFiles.map((f) => `• ${f}`).join('\n');
      showToast(
        `导出失败：以下媒体文件不存在或无法访问：\n${fileList}\n\n请检查文件路径或重新导入媒体。`,
        'error',
        10000,
      );
      return;
    }

    // Step 3: Start export via Extension (neko-engine)
    setIsExporting(true);
    setExportProgress({
      stage: 'initializing',
      percent: 0,
      message: '准备导出...',
      currentFrame: 0,
      totalFrames: 0,
      elapsedTime: 0,
      estimatedTimeRemaining: 0,
      currentFps: 0,
    });
    exportRef.current.isActive = true;

    // Send export request to Extension
    const exportConfig = {
      outputPath: exportPath,
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
      type: 'export:start',
      project,
      config: exportConfig,
    });
  }, [
    project,
    format,
    videoCodec,
    audioCodec,
    resolution,
    quality,
    fps,
    audioBitrate,
    t,
    showToast,
    selectExportPath,
  ]);

  const handleCancel = useCallback(() => {
    vscodePostMessage({ type: 'export:cancel' });
    setIsExporting(false);
    setExportProgress(null);
    sendExportProgress({ isExporting: false, percent: 0, message: '' });
    exportRef.current.isActive = false;
  }, [sendExportProgress]);

  const handleBackgroundExport = useCallback(() => {
    showToast('导出将在后台继续，请查看状态栏进度', 'info');
    onClose();
  }, [onClose, showToast]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isOpen) return null;

  if (isExporting) {
    return (
      <ExportProgressView
        exportProgress={exportProgress}
        queueStatus={queueStatus}
        onBackgroundExport={handleBackgroundExport}
        onCancel={handleCancel}
      />
    );
  }

  return (
    <ExportConfigView
      format={format}
      videoCodec={videoCodec}
      audioCodec={audioCodec}
      resolution={resolution}
      quality={quality}
      fps={fps}
      audioBitrate={audioBitrate}
      presets={presets}
      selectedPresetId={selectedPresetId}
      hwCapabilities={hwCapabilities}
      hasGlobalExport={hasGlobalExport}
      onFormatChange={handleFormatChange}
      onVideoCodecChange={setVideoCodec}
      onAudioCodecChange={setAudioCodec}
      onResolutionChange={setResolution}
      onQualityChange={setQuality}
      onFpsChange={setFps}
      onAudioBitrateChange={setAudioBitrate}
      onPresetChange={handlePresetChange}
      onSelectedPresetIdChange={setSelectedPresetId}
      onExport={handleExport}
      onClose={onClose}
    />
  );
}
