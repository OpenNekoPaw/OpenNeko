export interface DesktopClosableWindow {
  isDestroyed(): boolean;
  once(event: 'closed', listener: () => void): unknown;
  removeListener(event: 'closed', listener: () => void): unknown;
  close(): void;
}

export async function closeDesktopWindows(
  windows: readonly DesktopClosableWindow[],
): Promise<void> {
  await Promise.all(windows.map((window) => closeDesktopWindow(window)));
}

function closeDesktopWindow(window: DesktopClosableWindow): Promise<void> {
  if (window.isDestroyed()) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const handleClosed = (): void => {
      resolve();
    };
    window.once('closed', handleClosed);
    try {
      window.close();
    } catch (error) {
      window.removeListener('closed', handleClosed);
      reject(error);
    }
  });
}
