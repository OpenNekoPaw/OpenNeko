import type { ProjectData, TimelineElement } from '../../types';

export interface TimelineSelectionRef {
  trackId: string;
  elementId: string;
}

function getElementEndTime(element: TimelineElement): number {
  return element.startTime + (element.duration - element.trimStart - element.trimEnd);
}

export function getDuplicateInsertTime(
  project: ProjectData | null,
  selectedElements: TimelineSelectionRef[],
  fallbackElement: TimelineElement,
): number {
  if (!project || selectedElements.length === 0) {
    return getElementEndTime(fallbackElement);
  }

  const selectedEndTimes = selectedElements
    .map((selection) => {
      const track = project.tracks.find((candidate) => candidate.id === selection.trackId);
      const element = track?.elements.find((candidate) => candidate.id === selection.elementId);
      return element ? getElementEndTime(element) : null;
    })
    .filter((time): time is number => time !== null);

  if (selectedEndTimes.length === 0) {
    return getElementEndTime(fallbackElement);
  }

  return Math.max(...selectedEndTimes);
}
