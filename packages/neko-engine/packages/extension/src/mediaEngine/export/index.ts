/**
 * Export Module
 *
 * Video export functionality using GPU compositing and native encoding.
 */

export {
  ExportService,
  type ExportConfig,
  type ExportProgress,
  type ExportResult,
  type ExportProgressCallback,
  type TrackLayer,
  type FrameProvider,
} from './ExportService';

export {
  JviProjectLoader,
  type JviProject,
  type JviTrack,
  type JviElement,
} from './JviProjectLoader';

export { createVideoFrameProvider } from './VideoFrameProvider';
