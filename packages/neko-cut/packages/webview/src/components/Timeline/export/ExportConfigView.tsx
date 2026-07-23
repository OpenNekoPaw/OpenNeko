import type { CutExportTaskSnapshot, TimelineView } from '@neko-cut/domain';
import { useTranslation } from '../../../i18n/I18nContext';

export function ExportConfigView(props: {
  readonly view?: TimelineView;
  readonly recentTasks: readonly CutExportTaskSnapshot[];
  readonly onExport: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useTranslation();
  const profile = props.view?.profile;
  const fps = profile ? profile.editRateNumerator / profile.editRateDenominator : 30;
  return (
    <div className="cut-basic-export-config">
      <dl>
        <div>
          <dt>{t('export.format')}</dt>
          <dd>MP4 · H.264 / AAC</dd>
        </div>
        <div>
          <dt>{t('export.resolution')}</dt>
          <dd>{profile ? `${profile.width} × ${profile.height}` : '1920 × 1080'}</dd>
        </div>
        <div>
          <dt>{t('export.fps')}</dt>
          <dd>{fps.toFixed(2)} fps</dd>
        </div>
        <div>
          <dt>{t('timeline.basic.duration')}</dt>
          <dd>{(props.view?.durationSeconds ?? 0).toFixed(2)} s</dd>
        </div>
      </dl>
      {props.recentTasks.length > 0 ? (
        <div className="cut-basic-export-history">
          {props.recentTasks.map((task) => (
            <span data-status={task.status} key={task.jobId}>
              {task.outputWorkspaceRelativePath} · {task.status}
            </span>
          ))}
        </div>
      ) : null}
      <div className="cut-basic-export-actions">
        <button onClick={props.onClose} type="button">
          {t('common.cancel')}
        </button>
        <button disabled={!props.view} onClick={props.onExport} type="button">
          {t('export.start')}
        </button>
      </div>
    </div>
  );
}
