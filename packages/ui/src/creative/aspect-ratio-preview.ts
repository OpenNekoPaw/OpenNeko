export function aspectRatioPreviewSize(value: string): {
  readonly width: number;
  readonly height: number;
} {
  const [rawWidth, rawHeight] = value.split(':').map(Number);
  const valid = Boolean(rawWidth && rawWidth > 0 && rawHeight && rawHeight > 0);
  const width = valid ? rawWidth! : 1;
  const height = valid ? rawHeight! : 1;
  const scale = 18 / Math.max(width, height);
  return {
    width: Math.max(5, width * scale),
    height: Math.max(5, height * scale),
  };
}
