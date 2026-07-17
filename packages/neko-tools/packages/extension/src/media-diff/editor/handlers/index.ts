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
export { MAX_CONCURRENT_FRAMES } from './types';

export {
  initializeDiff,
  initializeLocalDiff,
  cancelCurrentAnalysis,
  detectMediaTypeFromExtension,
  areFilesIdentical,
  ensurePreviousFilePath,
} from './AnalysisPipeline';

export { handleSeek, handleGetFrame, handleInspectElement } from './FrameOperations';

export {
  sendVisualizationData,
  sendVisualizationDataForLocal,
  sendWaveformFromResult,
  startEarlyWaveform,
  startEarlyFrameExtraction,
} from './VisualizationHandler';

export {
  handleStartStreaming,
  handleStopStreaming,
  handleStreamControl,
  handleStartAudioStreaming,
  handleStopAudioStreaming,
  handleAudioStreamControl,
} from './StreamingController';
