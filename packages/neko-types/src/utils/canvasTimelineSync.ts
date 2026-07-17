import type { NekoCanvasAPI } from '../types/extension-api';
import type {
  CanvasTimelineShotSync,
  CanvasTimelineSyncPayload,
} from '../types/canvas-timeline-sync';

export function buildStoryboardImportTimelineSyncPayload(
  shotIds: readonly string[],
  projectName: string,
  importedAt: number,
): CanvasTimelineSyncPayload {
  return {
    source: 'neko-cut',
    reason: 'storyboard-import',
    shots: shotIds.map((shotId) => ({
      shotId,
      projectName,
      importedAt,
    })),
  };
}

export async function applyCanvasTimelineSyncToCanvas(
  api: Pick<NekoCanvasAPI, 'nodes'>,
  payload: CanvasTimelineSyncPayload,
): Promise<void> {
  await Promise.all(payload.shots.map((shot) => applyShotTimelineSync(api, shot)));
}

async function applyShotTimelineSync(
  api: Pick<NekoCanvasAPI, 'nodes'>,
  shot: CanvasTimelineShotSync,
): Promise<void> {
  const update: {
    lastImportedToTimelineAt?: number;
    lastImportedToTimelineProject?: string;
  } = {};

  if (typeof shot.importedAt === 'number') {
    update.lastImportedToTimelineAt = shot.importedAt;
  }

  if (typeof shot.projectName === 'string' && shot.projectName.length > 0) {
    update.lastImportedToTimelineProject = shot.projectName;
  }

  if (Object.keys(update).length === 0) {
    return;
  }

  await api.nodes.update(shot.shotId, update);
}
