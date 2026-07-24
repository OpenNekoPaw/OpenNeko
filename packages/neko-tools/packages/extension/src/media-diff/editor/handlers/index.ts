/**
 * Domain-specific handlers for MediaDiffMessageHandler.
 *
 * Each module handles a distinct concern:
 * - AnalysisPipeline: diff initialization, Git/local analysis orchestration
 * - FrameOperations: seek, frame extraction, element inspection
 * - VisualizationHandler: image data, waveform, early extraction
 * - StreamingController: video/audio stream lifecycle and playback control
 */

export type { IHandlerContext } from './types';
export { initializeDiff, initializeLocalDiff, cancelCurrentAnalysis } from './AnalysisPipeline';

export { handleSeek, handleGetFrame, handleInspectElement } from './FrameOperations';

export {
  handleStartStreaming,
  handleStopStreaming,
  handleStreamControl,
  handleStartAudioStreaming,
  handleStopAudioStreaming,
  handleAudioStreamControl,
} from './StreamingController';
