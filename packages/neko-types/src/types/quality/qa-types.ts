/**
 * QA Types — Data types for creative output quality analysis
 *
 * Shared contract layer, zero vscode dependency.
 *
 * These types are used by:
 *   - Pipeline diagnostics Skill (agent-guided analysis on user request)
 *   - Gate preview enrichment (scene summary + media path for user review)
 *   - Run report scene summary
 *
 * NOT used for automated LLM-evaluates-LLM scoring.
 * Quality judgment is the user's responsibility via Gate confirm/cancel.
 */

// =============================================================================
// Scene Review (user-facing, shown at Gate preview)
// =============================================================================

/** User verdict after reviewing a scene at a Gate */
export type SceneVerdict = 'accept' | 'needs-edit' | 'regenerate';

/** Per-scene review card — structured data for Gate preview */
export interface SceneReviewCard {
  /** Scene index (matches StoryboardScene.index) */
  sceneIndex: number;
  /** Scene heading from storyboard */
  heading: string;
  /** Scene description (brief, for user reference) */
  description: string;
  /** Path to the generated media file */
  mediaPath: string;
  /** Media type */
  mediaType: 'image' | 'video';
  /** User verdict (set during Gate review) */
  verdict?: SceneVerdict;
  /** User notes (optional, from Gate review) */
  notes?: string;
}

/** Gate preview data — sent to WebView when pipeline pauses for user review */
export interface GatePreviewData {
  /** Stage that triggered the gate */
  stageName: string;
  /** Scene review cards for user inspection */
  scenes: SceneReviewCard[];
  /** Global style applied */
  globalStyle?: string;
  /** Indices of scenes that failed generation */
  failedIndices: number[];
}

// =============================================================================
// Diagnostics (Agent-guided analysis on user request)
// =============================================================================

/** Scene diagnostic — produced by diagnostics Skill when user asks "what went wrong" */
export interface SceneDiagnostic {
  sceneIndex: number;
  heading: string;
  /** What the storyboard asked for */
  intendedDescription: string;
  /** What was actually generated (media path) */
  generatedPath?: string;
  /** Issues identified by Agent analysis */
  issues: string[];
  /** Agent's suggested fix (prompt revision, style change, etc.) */
  suggestion: string;
}

/** Pipeline diagnostics report — produced by diagnostics Skill */
export interface DiagnosticsReport {
  pipelineId: string;
  flowId: string;
  /** Overall status */
  status: 'healthy' | 'partial-failure' | 'failed';
  /** Which stages succeeded/failed */
  stagesSummary: string;
  /** Per-scene diagnostics (only for scenes with issues) */
  sceneDiagnostics: SceneDiagnostic[];
  /** Recommended next actions */
  recommendations: string[];
}

// =============================================================================
// P2: Cross-Scene Consistency (data types — used by future Skill)
// =============================================================================

/** Style drift between two adjacent scenes */
export interface StyleDriftPair {
  fromScene: number;
  toScene: number;
  /** Drift score 0-100 (0 = identical style, 100 = completely different) */
  driftScore: number;
  /** Description of the style change */
  description: string;
}

/** Character appearance tracking across scenes */
export interface CharacterAppearance {
  /** Character name or identifier */
  name: string;
  /** Per-scene appearance evaluations */
  appearances: Array<{
    sceneIndex: number;
    /** Consistency score vs first appearance (0-100) */
    score: number;
    /** Specific inconsistencies found */
    issues: string[];
  }>;
}

/** Complete cross-scene consistency report */
export interface ConsistencyReport {
  /** Overall consistency score (0-100) */
  overallConsistency: number;
  /** Style drift analysis between adjacent scenes */
  styleDrift: StyleDriftPair[];
  /** Character appearance consistency */
  characterConsistency: CharacterAppearance[];
  /** Overall aesthetic quality score (0-100) */
  aestheticScore: number;
  /** Actionable recommendations */
  recommendations: string[];
}

// =============================================================================
// P1: Structured Quality Assessment (replaces free-text issues)
// =============================================================================

/** Media type for quality evaluation */
export type EvalMediaType = 'image' | 'video' | 'audio';

/** Issue severity level */
export type IssueSeverity = 'critical' | 'major' | 'minor' | 'info';

/** Structured issue category — drives deterministic remediation mapping */
export type QualityIssueCategory =
  // Technical (detectable by Engine or heuristics)
  | 'artifact'
  | 'resolution'
  | 'color-distortion'
  | 'audio-noise'
  | 'audio-clipping'
  | 'loudness-off'
  // Semantic (requires LLM judgment)
  | 'prompt-mismatch'
  | 'script-mismatch'
  | 'style-drift'
  | 'character-inconsistency'
  | 'composition-poor'
  | 'motion-unnatural'
  // Video-specific (detectable by frame analysis)
  | 'jitter'
  | 'tearing'
  | 'stuttering';

/** All valid issue category values (runtime counterpart of QualityIssueCategory) */
export const QUALITY_ISSUE_CATEGORIES: readonly QualityIssueCategory[] = [
  'artifact',
  'resolution',
  'color-distortion',
  'audio-noise',
  'audio-clipping',
  'loudness-off',
  'prompt-mismatch',
  'script-mismatch',
  'style-drift',
  'character-inconsistency',
  'composition-poor',
  'motion-unnatural',
  'jitter',
  'tearing',
  'stuttering',
] as const;

/** Structured quality issue with category, severity, and optional remediation */
export interface QualityIssue {
  /** Issue category — maps to RemediationPlanner */
  category: QualityIssueCategory;
  /** Severity level */
  severity: IssueSeverity;
  /** Human-readable description */
  description: string;
  /** Spatial/temporal location (optional) */
  location?: {
    sceneIndex?: number;
    timeRange?: { start: number; end: number };
    region?: { x: number; y: number; w: number; h: number };
  };
  /** Associated remediation action (populated by RemediationPlanner) */
  remediation?: RemediationAction;
}

/** Remediation action type — maps to existing ToolSet tools */
export type RemediationActionType =
  | 'regenerate'
  | 'regenerate-ref'
  | 'apply-effect'
  | 'color-correct'
  | 'adjust-audio'
  | 'manual-review';

/** Executable remediation action with tool mapping */
export interface RemediationAction {
  /** Action type */
  type: RemediationActionType;
  /** Human-readable description */
  description: string;
  /** Target tool name from existing ToolSet (e.g., 'AddEffect', 'SetColorCorrection') */
  toolName?: string;
  /** Tool call parameters */
  toolParams?: Record<string, unknown>;
  /** Optimized prompt for regeneration (type='regenerate') */
  optimizedPrompt?: string;
  /** Planner confidence 0-1 */
  confidence: number;
}

/** Multi-dimensional media evaluation result (replaces {score, issues: string[]}) */
export interface MediaEvaluation {
  /** Overall quality score 0-100 */
  overallScore: number;
  /** Per-dimension scores */
  dimensions: {
    /** Technical quality (clarity, artifacts, coherence) */
    technicalQuality: number;
    /** Prompt adherence (matches generation prompt) */
    promptAdherence: number;
    /** Script adherence (matches storyboard scene, if provided) */
    scriptAdherence?: number;
    /** Aesthetic quality (composition, color harmony, visual appeal) */
    aesthetics: number;
    /** Audio-specific technical score (only for audio evaluation) */
    audioQuality?: number;
    /** Video-specific quality score (only for video evaluation) */
    videoQuality?: number;
  };
  /** Structured issues list */
  issues: QualityIssue[];
  /** Whether evaluation passes the minimum threshold */
  passed: boolean;
  /** Audio technical metrics (only for audio evaluation) */
  audioMetrics?: AudioTechnicalMetrics;
  /** Video technical metrics (only for video evaluation) */
  videoMetrics?: VideoTechnicalMetrics;
}

// =============================================================================
// P2: Video Technical Metrics
// =============================================================================

/** Video technical analysis result from frame extraction + adjacent-frame comparison */
export interface VideoTechnicalMetrics {
  /** Duration in seconds (from probe) */
  duration: number;
  /** Frame rate (from probe) */
  fps: number;
  /** Resolution width */
  width: number;
  /** Resolution height */
  height: number;
  /** Number of frames sampled for evaluation */
  framesSampled: number;
  /** Mean SSIM between adjacent sampled frames (0-1, higher = more stable) */
  meanAdjacentSsim?: number;
  /** Min SSIM between adjacent sampled frames (detects sudden visual jumps) */
  minAdjacentSsim?: number;
  /** Mean PSNR between adjacent sampled frames (dB, higher = more stable) */
  meanAdjacentPsnr?: number;
}

// =============================================================================
// P3: Audio Technical Metrics
// =============================================================================

/** Audio technical analysis result from Engine (deterministic, no LLM) */
export interface AudioTechnicalMetrics {
  /** Integrated loudness in LUFS (ITU-R BS.1770-4) */
  integratedLufs: number;
  /** True peak level in dBFS */
  truePeakDbfs: number;
  /** Loudness range in LU */
  loudnessRange: number;
  /** Silence ratio (0.0 - 1.0), from EngineClient.detectSilence() */
  silenceRatio: number;
  /** Number of silence regions */
  silenceRegionCount: number;
  /** Whether clipping is detected (truePeak > -1 dBFS) */
  clippingDetected: boolean;
  /** Whether loudness is within broadcast range (-16 to -12 LUFS) */
  loudnessInRange: boolean;
}
