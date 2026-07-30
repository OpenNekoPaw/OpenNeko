export type OtioMetadata = Readonly<Record<string, unknown>>;

export interface OtioRationalTime {
  readonly OTIO_SCHEMA: 'RationalTime.1';
  readonly value: number;
  readonly rate: number;
}

export interface OtioTimeRange {
  readonly OTIO_SCHEMA: 'TimeRange.1';
  readonly start_time: OtioRationalTime;
  readonly duration: OtioRationalTime;
}

export interface OtioExternalReference {
  readonly OTIO_SCHEMA: 'ExternalReference.1';
  readonly name?: string;
  readonly target_url: string;
  readonly available_range?: OtioTimeRange | null;
  readonly metadata: OtioMetadata;
}

export interface OtioLinearTimeWarp {
  readonly OTIO_SCHEMA: 'LinearTimeWarp.1';
  readonly name: string;
  readonly effect_name: 'LinearTimeWarp';
  readonly time_scalar: number;
  readonly metadata: OtioMetadata;
}

export interface OtioClip {
  readonly OTIO_SCHEMA: 'Clip.2';
  readonly name: string;
  readonly media_reference: OtioExternalReference;
  readonly source_range: OtioTimeRange;
  readonly metadata: OtioMetadata;
  readonly enabled?: boolean;
  readonly effects?: readonly OtioLinearTimeWarp[];
  readonly markers?: readonly never[];
}

export interface OtioGap {
  readonly OTIO_SCHEMA: 'Gap.1';
  readonly name?: string;
  readonly source_range: OtioTimeRange;
  readonly metadata: OtioMetadata;
  readonly effects?: readonly never[];
  readonly markers?: readonly never[];
}

export type OtioTrackItem = OtioClip | OtioGap;
export type OtioTrackKind = 'Video' | 'Audio' | 'Subtitle';

export interface OtioTrack {
  readonly OTIO_SCHEMA: 'Track.1';
  readonly name: string;
  readonly kind: OtioTrackKind;
  readonly children: readonly OtioTrackItem[];
  readonly metadata: OtioMetadata;
  readonly enabled?: boolean;
  readonly effects?: readonly never[];
  readonly markers?: readonly never[];
}

export interface OtioStack {
  readonly OTIO_SCHEMA: 'Stack.1';
  readonly name: string;
  readonly children: readonly OtioTrack[];
  readonly metadata: OtioMetadata;
  readonly effects?: readonly never[];
  readonly markers?: readonly never[];
}

export interface OtioTimeline {
  readonly OTIO_SCHEMA: 'Timeline.1';
  readonly name: string;
  readonly global_start_time: OtioRationalTime | null;
  readonly tracks: OtioStack;
  readonly metadata: OtioMetadata;
}

export interface CutProjectProfile {
  readonly profile: string;
  readonly editRateNumerator: number;
  readonly editRateDenominator: number;
  readonly width: number;
  readonly height: number;
}

export interface CutAudioSettings {
  readonly gainDb?: number;
  readonly muted: boolean;
  readonly fadeInSeconds?: number;
  readonly fadeOutSeconds?: number;
}

export interface CutClipIdentity {
  readonly clipId: string;
  readonly linkedAudioClipId?: string;
  readonly linkedVideoClipId?: string;
}

export interface CutTrackIdentity {
  readonly trackId: string;
}

export interface CutEditState {
  readonly locked: boolean;
}

export type CutClipIdFactory = () => string;
export type CutTrackIdFactory = () => string;
