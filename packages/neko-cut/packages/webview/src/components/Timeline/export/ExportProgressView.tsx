import type { CutExportTaskSnapshot } from '@neko-cut/domain';
import { useTranslation } from '../../../i18n/I18nContext';

export function ExportProgressView(props: {
  readonly task: CutExportTaskSnapshot;
  readonly onBackgroundExport: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="cut-basic-export-progress">
      <div className="cut-basic-export-spinner" aria-hidden="true" />
      <strong>{props.task.outputWorkspaceRelativePath}</strong>
      <span>
        {props.task.settings.width} × {props.task.settings.height} ·{' '}
        {props.task.settings.framesPerSecond} fps
      </span>
      <span>{t('timeline.basic.backgroundExport')}</span>
      <div className="cut-basic-export-actions">
        <button onClick={props.onBackgroundExport} type="button">
          {t('export.background')}
        </button>
        <button onClick={props.onCancel} type="button">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}
