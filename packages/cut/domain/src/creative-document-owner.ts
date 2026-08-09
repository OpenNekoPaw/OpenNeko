import { parseOtio, serializeOtio } from './codec';
import { createOtioTimeline } from './document';

export function createEmptyCutDocumentBytes(name: string): Uint8Array {
  return serializeOtio(
    createOtioTimeline(name.normalize('NFC'), {
      profile: '1080p30',
      editRateNumerator: 30,
      editRateDenominator: 1,
      width: 1920,
      height: 1080,
    }),
  );
}

export function isValidCutDocumentBytes(bytes: Uint8Array): boolean {
  return parseOtio(bytes).ok;
}
