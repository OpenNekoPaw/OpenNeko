export interface PreviewContainRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function containSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): PreviewContainRect {
  for (const value of [sourceWidth, sourceHeight, canvasWidth, canvasHeight]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('Preview dimensions must be finite positive numbers.');
    }
  }
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (canvasWidth - width) / 2,
    y: (canvasHeight - height) / 2,
    width,
    height,
  };
}

export function drawContainedVideoFrame(
  context: CanvasRenderingContext2D,
  frame: VideoFrame,
): void {
  const canvas = context.canvas;
  const rect = containSourceRect(
    frame.displayWidth,
    frame.displayHeight,
    canvas.width,
    canvas.height,
  );
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(frame, rect.x, rect.y, rect.width, rect.height);
}
