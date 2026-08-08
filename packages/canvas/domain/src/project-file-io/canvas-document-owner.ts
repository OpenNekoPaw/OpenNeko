import { loadNkc, saveNkc } from '../nkc';
import { createEmptyCanvasData } from '../utils/canvasHeadlessAuthoring';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export function createEmptyCanvasDocumentBytes(name: string): Uint8Array {
  return textEncoder.encode(saveNkc(createEmptyCanvasData(name.normalize('NFC'))));
}

export function isValidCanvasDocumentBytes(bytes: Uint8Array): boolean {
  try {
    return loadNkc(textDecoder.decode(bytes)).validation.valid;
  } catch {
    return false;
  }
}
