/// <reference types="vite/client" />

// Global augmentations for webview runtime APIs
interface Window {
  /** Injected by PreviewPanel for screenshot capture */
  __previewPanelCaptureScreenshot?: () => Promise<void>;
}

// Vite worker imports
declare module '*?worker&inline' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}
