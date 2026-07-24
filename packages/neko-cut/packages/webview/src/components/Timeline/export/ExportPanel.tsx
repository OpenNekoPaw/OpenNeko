import { Dialog } from '@neko/ui/primitives';
import { useCutOtioController } from '../../../controllers/CutOtioControllerContext';
import { useCutPresentationStore } from '../../../stores/cut-presentation-store';
import { useTranslation } from '../../../i18n/I18nContext';
import type { ExportPanelProps } from './exportConstants';
import { ExportConfigView } from './ExportConfigView';
import { ExportProgressView } from './ExportProgressView';

export function ExportPanel({ isOpen, onClose }: ExportPanelProps) {
  const { t } = useTranslation();
  const controller = useCutOtioController();
  const view = useCutPresentationStore((state) => state.view);
  const tasks = useCutPresentationStore((state) => state.exportTasks);
  const activeTask = tasks.find(
    (task) =>
      task.status === 'running' &&
      task.documentUri === view?.documentUri &&
      task.sessionId === view?.sessionId,
  );
  return (
    <Dialog
      className="cut-basic-export-dialog"
      closeLabel={t('common.close')}
      description={t('timeline.basic.exportDescription')}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={isOpen}
      title={activeTask ? t('export.progress.title') : t('export.title')}
    >
      {activeTask ? (
        <ExportProgressView
          task={activeTask}
          onBackgroundExport={onClose}
          onCancel={() => controller.cancelExport(activeTask.jobId)}
        />
      ) : (
        <ExportConfigView
          view={view}
          recentTasks={tasks.filter((task) => task.documentUri === view?.documentUri).slice(-3)}
          onClose={onClose}
          onExport={(settings) => controller.startExport(settings)}
        />
      )}
    </Dialog>
  );
}
