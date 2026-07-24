export interface PlayheadFollowInput {
  readonly playheadPixels: number;
  readonly scrollLeft: number;
  readonly viewportWidth: number;
}

export function nextPlayheadFollowScrollLeft(input: PlayheadFollowInput): number {
  const margin = input.viewportWidth * 0.2;
  const minimumVisible = input.scrollLeft + margin;
  const maximumVisible = input.scrollLeft + input.viewportWidth - margin;
  if (input.playheadPixels < minimumVisible) {
    return Math.max(0, input.playheadPixels - margin);
  }
  if (input.playheadPixels > maximumVisible) {
    return Math.max(0, input.playheadPixels - input.viewportWidth + margin);
  }
  return input.scrollLeft;
}
