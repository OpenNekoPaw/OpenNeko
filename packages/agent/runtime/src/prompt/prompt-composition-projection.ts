export interface PromptCompositionFragmentProjection {
  readonly id: string;
  readonly source: string;
  readonly order: number;
  readonly version?: string;
  readonly hash: string;
}
