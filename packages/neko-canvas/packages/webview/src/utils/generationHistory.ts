import type { GeneratedImageVersion } from '@neko/shared';

export function appendSelectedGenerationCandidate(
  history: GeneratedImageVersion[],
  candidate: GeneratedImageVersion,
): GeneratedImageVersion[] {
  return [...history, candidate].map((entry, index, list) => ({
    ...entry,
    selected: index === list.length - 1,
  }));
}

export function selectGenerationCandidate(
  history: GeneratedImageVersion[],
  candidateId: string,
): GeneratedImageVersion[] {
  return history.map((entry) => ({
    ...entry,
    selected: entry.id === candidateId,
  }));
}
