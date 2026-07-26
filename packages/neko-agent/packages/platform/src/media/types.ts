export interface MediaRoutingResult {
  readonly providerId: string;
  readonly modelId: string;
  readonly score: number;
  readonly reason: string;
}
