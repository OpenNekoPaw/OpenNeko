/**
 * TimelineDiffAnalyzer - JVI Project Structural Diff
 *
 * Delegates Timeline JSON comparison to the Node media runtime service.
 */

import type { DiffOptions, DiffResult, TimelineDiffDetails } from '@neko/shared';
import type { IMediaRuntimeService } from '../../../contracts/IMediaRuntimeService';
import type { ITempFileService } from '../../../contracts/ITempFileService';
import { TempFileBackedMediaDiffAnalyzer } from './TempFileBackedMediaDiffAnalyzer';

export class TimelineDiffAnalyzer extends TempFileBackedMediaDiffAnalyzer {
  readonly mediaType = 'timeline' as const;

  constructor(
    private readonly mediaRuntimeService: IMediaRuntimeService,
    tempFileService: ITempFileService,
  ) {
    super(['.nkv'], tempFileService);
  }

  async analyze(current: Buffer, previous: Buffer, options?: DiffOptions): Promise<DiffResult> {
    this.createAbortController();
    await this.waitForPendingCleanup();
    const localTempFiles: string[] = [];

    try {
      const ext = options?.fileExtension ?? '.nkv';
      const [currentPath, previousPath] = await this.writeTempFiles(
        'timeline-diff',
        current,
        previous,
        ext,
        localTempFiles,
      );
      this.throwIfAborted();

      const runtimeResult = await this.mediaRuntimeService.diff(
        'timelines',
        currentPath,
        previousPath,
      );

      this.throwIfAborted();

      const tl = runtimeResult.timelineDiff;

      // Convert generated Diff contract types to the UI protocol.
      const details: TimelineDiffDetails = {
        project: {
          name: {
            current: tl?.currentProject?.name ?? 'Untitled',
            previous: tl?.previousProject?.name ?? 'Untitled',
          },
          resolution: {
            current: {
              width: tl?.currentProject?.resolutionWidth ?? 1920,
              height: tl?.currentProject?.resolutionHeight ?? 1080,
            },
            previous: {
              width: tl?.previousProject?.resolutionWidth ?? 1920,
              height: tl?.previousProject?.resolutionHeight ?? 1080,
            },
          },
          fps: {
            current: tl?.currentProject?.fps ?? 30,
            previous: tl?.previousProject?.fps ?? 30,
          },
        },
        trackChanges: (tl?.trackChanges ?? []).map((tc) => ({
          trackId: tc.trackId,
          trackName: tc.trackName,
          trackType: tc.trackType,
          changeType: tc.changeType,
          propertyChanges: tc.propertyChanges?.length
            ? tc.propertyChanges.map((pc) => ({
                property: pc.property,
                previous: pc.previous,
                current: pc.current,
              }))
            : undefined,
          elementChanges: tc.elementChanges?.length
            ? tc.elementChanges.map((ec) => ({
                elementId: ec.elementId,
                elementName: ec.elementName,
                elementType: ec.elementType,
                changeType: ec.changeType,
                propertyChanges: ec.propertyChanges?.length
                  ? ec.propertyChanges.map((pc) => ({
                      property: pc.property,
                      previous: pc.previous,
                      current: pc.current,
                    }))
                  : undefined,
                src: ec.src,
                previousSrc: ec.previousSrc,
                startTime: ec.startTime,
                duration: ec.duration,
              }))
            : undefined,
        })),
        summary: tl?.summary ?? {
          tracksAdded: 0,
          tracksRemoved: 0,
          tracksModified: 0,
          elementsAdded: 0,
          elementsRemoved: 0,
          elementsModified: 0,
          mediaSourceChanges: 0,
        },
        duration: {
          current: tl?.durationCurrent ?? 0,
          previous: tl?.durationPrevious ?? 0,
        },
      };

      const similarity = this.calcSimilarity(details);

      return {
        mediaType: 'timeline',
        similarity,
        details,
      };
    } finally {
      await this.cleanupTempFiles(localTempFiles);
    }
  }

  private calcSimilarity(details: TimelineDiffDetails): number {
    const { summary } = details;
    const totalChanges =
      summary.tracksAdded +
      summary.tracksRemoved +
      summary.tracksModified +
      summary.elementsAdded +
      summary.elementsRemoved +
      summary.elementsModified;

    if (totalChanges === 0) {
      const metaChanged =
        details.project.name.current !== details.project.name.previous ||
        details.project.fps.current !== details.project.fps.previous ||
        details.project.resolution.current.width !== details.project.resolution.previous.width ||
        details.project.resolution.current.height !== details.project.resolution.previous.height;
      return metaChanged ? 0.95 : 1.0;
    }

    const totalItems =
      details.trackChanges.reduce((sum, tc) => sum + (tc.elementChanges?.length ?? 0), 0) +
      details.trackChanges.length;

    if (totalItems === 0) return 1.0;

    const changeRatio = totalChanges / Math.max(totalItems * 2, 1);
    return Math.max(0, 1 - changeRatio);
  }
}
