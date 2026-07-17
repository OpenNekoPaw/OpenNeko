/**
 * Streaming video diff components
 *
 * Pipeline: H264StreamClient → FramePairBuffer → DiffRenderer → WebGL canvas
 */

export { FramePairBuffer, type FramePair, type FramePairBufferConfig } from './FramePairBuffer';
export { DiffRenderer, type DiffMode, type DiffRendererConfig } from './DiffRenderer';
export {
  StreamingVideoDiffViewer,
  type StreamingVideoDiffViewerProps,
  type StreamingVideoDiffViewerHandle,
} from './StreamingVideoDiffViewer';
