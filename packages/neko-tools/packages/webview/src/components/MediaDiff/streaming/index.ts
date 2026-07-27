/**
 * Streaming video diff components
 *
 * Pipeline: qualified video descriptors → HTML video → DiffRenderer → WebGL canvas
 */

export { DiffRenderer, type DiffMode, type DiffRendererConfig } from './DiffRenderer';
export {
  StreamingVideoDiffViewer,
  type StreamingVideoDiffViewerProps,
  type StreamingVideoDiffViewerHandle,
} from './StreamingVideoDiffViewer';
