import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  resolveTimelinePlaybackEndSeconds,
  type CutExportSettings,
  type CutExportTaskSnapshot,
  type TimelineView,
} from '@neko-cut/domain';
import { NumberInput } from '@neko/ui/creative';
import { Checkbox, Select } from '@neko/ui/primitives';
import { useTranslation } from '../../../i18n/I18nContext';

const VIDEO_BITRATES = [4_000_000, 8_000_000, 12_000_000, 20_000_000] as const;
const AUDIO_BITRATES = [128_000, 192_000, 256_000, 320_000] as const;
const FRAME_RATES = [23.976, 24, 25, 29.97, 30, 60] as const;

export function ExportConfigView(props: {
  readonly view?: TimelineView;
  readonly recentTasks: readonly CutExportTaskSnapshot[];
  readonly onExport: (settings: CutExportSettings) => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const profile = props.view?.profile;
  const projectFps = profile ? profile.editRateNumerator / profile.editRateDenominator : 30;
  const initial = useMemo(
    () => defaultSettings(props.view, projectFps),
    [projectFps, props.view?.documentUri, props.view?.sessionId],
  );
  const [settings, setSettings] = useState<CutExportSettings>(initial);
  const [resolution, setResolution] = useState('project');
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    setSettings(initial);
    setResolution('project');
  }, [initial]);

  const set = <K extends keyof CutExportSettings>(key: K, value: CutExportSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };
  const selectResolution = (value: string) => {
    setResolution(value);
    if (value === 'project') {
      setSettings((current) => ({
        ...current,
        width: profile?.width ?? 1920,
        height: profile?.height ?? 1080,
      }));
      return;
    }
    const size = aspectResolution(profile?.width ?? 1920, profile?.height ?? 1080, Number(value));
    setSettings((current) => ({ ...current, ...size }));
  };
  const duration = props.view ? resolveTimelinePlaybackEndSeconds(props.view) : 0;
  const estimatedBytes =
    (duration * (settings.videoBitrate + (settings.includeAudio ? settings.audioBitrate : 0))) / 8;

  return (
    <div className="cut-basic-export-config">
      <label className="cut-basic-export-title-field">
        <span>{t('export.outputName')}</span>
        <input
          aria-label={t('export.outputName')}
          value={settings.outputName}
          onChange={(event) => set('outputName', event.currentTarget.value)}
        />
      </label>

      <section className="cut-basic-export-section">
        <h3>{t('export.videoSection')}</h3>
        <ExportRow label={t('export.resolution')}>
          <Select
            label={t('export.resolution')}
            value={resolution}
            options={[
              { value: 'project', label: t('export.resolution.project') },
              ...[480, 720, 1080, 1440, 2160].map((value) => ({
                value: String(value),
                label: value === 1440 ? '2K' : value === 2160 ? '4K' : String(value),
              })),
            ]}
            onValueChange={selectResolution}
          />
        </ExportRow>
        <ExportRow label={t('export.format')}>
          <Select
            label={t('export.format')}
            value={settings.container}
            options={[
              { value: 'mp4', label: t('export.container.mp4') },
              { value: 'mov', label: t('export.container.mov') },
            ]}
            onValueChange={(value) => set('container', value === 'mov' ? 'mov' : 'mp4')}
          />
        </ExportRow>
        <ExportRow label={t('export.fps')}>
          <Select
            label={t('export.fps')}
            value={String(settings.framesPerSecond)}
            options={[
              { value: String(projectFps), label: t('export.fps.project') },
              ...FRAME_RATES.filter((value) => value !== projectFps).map((value) => ({
                value: String(value),
                label: `${value} ${t('export.fps.unit')}`,
              })),
            ]}
            onValueChange={(value) => set('framesPerSecond', Number(value))}
          />
        </ExportRow>
        <ExportRow label={t('export.videoBitrate')}>
          <Select
            label={t('export.videoBitrate')}
            value={String(settings.videoBitrate)}
            options={VIDEO_BITRATES.map((value) => ({
              value: String(value),
              label: value === 8_000_000 ? t('export.bitrate.auto') : `${value / 1_000_000} Mbps`,
            }))}
            onValueChange={(value) => set('videoBitrate', Number(value))}
          />
        </ExportRow>
        <button
          className="cut-basic-export-more"
          type="button"
          onClick={() => setAdvanced(!advanced)}
        >
          {t('export.more')} <span aria-hidden="true">{advanced ? '▲' : '▼'}</span>
        </button>
        {advanced ? (
          <div className="cut-basic-export-dimensions">
            <NumberInput
              id="width"
              label={t('export.outputWidth')}
              min={16}
              max={16384}
              step={2}
              unit="px"
              value={settings.width}
              onCommit={(_, value) => set('width', value)}
              onPreviewChange={(_, value) => set('width', value)}
            />
            <NumberInput
              id="height"
              label={t('export.outputHeight')}
              min={16}
              max={16384}
              step={2}
              unit="px"
              value={settings.height}
              onCommit={(_, value) => set('height', value)}
              onPreviewChange={(_, value) => set('height', value)}
            />
          </div>
        ) : null}
      </section>

      <section className="cut-basic-export-section">
        <Checkbox
          id="cut-export-audio"
          checked={settings.includeAudio}
          label={t('export.audioSection')}
          onCheckedChange={(checked) => set('includeAudio', checked)}
        />
        {settings.includeAudio ? (
          <>
            <ExportRow label={t('export.audioBitrate')}>
              <Select
                label={t('export.audioBitrate')}
                value={String(settings.audioBitrate)}
                options={AUDIO_BITRATES.map((value) => ({
                  value: String(value),
                  label: `${value / 1000} kbps`,
                }))}
                onValueChange={(value) => set('audioBitrate', Number(value))}
              />
            </ExportRow>
            <ExportRow label={t('export.audioSampleRate')}>
              <Select
                label={t('export.audioSampleRate')}
                value={String(settings.audioSampleRate)}
                options={[
                  { value: '44100', label: '44.1 kHz' },
                  { value: '48000', label: '48 kHz' },
                ]}
                onValueChange={(value) =>
                  set('audioSampleRate', value === '44100' ? 44_100 : 48_000)
                }
              />
            </ExportRow>
          </>
        ) : null}
      </section>

      {props.recentTasks.length > 0 ? (
        <div className="cut-basic-export-history">
          {props.recentTasks.map((task) => (
            <span data-status={task.status} key={task.jobId}>
              {task.outputWorkspaceRelativePath} · {t(`export.status.${task.status}`)}
            </span>
          ))}
        </div>
      ) : null}

      <footer className="cut-basic-export-footer">
        <span>
          {t('export.summary', {
            duration: duration.toFixed(1),
            size: formatBytes(estimatedBytes),
            codec: `${settings.container.toUpperCase()} / H.264${settings.includeAudio ? ' / AAC' : ''}`,
          })}
        </span>
        <div className="cut-basic-export-actions">
          <button onClick={props.onClose} type="button">
            {t('common.cancel')}
          </button>
          <button
            disabled={!props.view || settings.outputName.trim().length === 0}
            onClick={() => props.onExport(settings)}
            type="button"
          >
            {t('export.start')}
          </button>
        </div>
      </footer>
    </div>
  );
}

function ExportRow(props: { readonly label: string; readonly children: React.ReactNode }) {
  return (
    <div className="cut-basic-export-row">
      <span>{props.label}</span>
      {props.children}
    </div>
  );
}

function defaultSettings(view: TimelineView | undefined, fps: number): CutExportSettings {
  return {
    outputName: view?.name ?? 'Untitled',
    container: 'mp4',
    width: view?.profile?.width ?? 1920,
    height: view?.profile?.height ?? 1080,
    framesPerSecond: fps,
    videoBitrate: 8_000_000,
    includeAudio: true,
    audioBitrate: 192_000,
    audioSampleRate: 48_000,
  };
}

function aspectResolution(width: number, height: number, target: number) {
  const landscape = width >= height;
  const scale = target / (landscape ? height : width);
  return { width: even(width * scale), height: even(height * scale) };
}

function even(value: number): number {
  return Math.max(16, Math.round(value / 2) * 2);
}

function formatBytes(value: number): string {
  return value >= 1_000_000_000
    ? `${(value / 1_000_000_000).toFixed(1)} GB`
    : `${Math.max(1, Math.round(value / 1_000_000))} MB`;
}
