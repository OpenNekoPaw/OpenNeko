export function buildWaveformPath(
  peaks: readonly number[],
  width: number,
  height: number,
  maximumPoints = 256,
): string {
  if (peaks.length === 0 || width <= 0 || height <= 0 || maximumPoints <= 0) return '';
  const pointCount = Math.min(peaks.length, maximumPoints);
  const center = height / 2;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const sourceIndex = Math.min(peaks.length - 1, Math.floor((index * peaks.length) / pointCount));
    const amplitude = Math.max(0, Math.min(1, Math.abs(peaks[sourceIndex] ?? 0)));
    const x = pointCount === 1 ? 0 : (index / (pointCount - 1)) * width;
    top.push(`${x.toFixed(2)},${(center - amplitude * center).toFixed(2)}`);
    bottom.unshift(`${x.toFixed(2)},${(center + amplitude * center).toFixed(2)}`);
  }
  return `M ${top.join(' L ')} L ${bottom.join(' L ')} Z`;
}
