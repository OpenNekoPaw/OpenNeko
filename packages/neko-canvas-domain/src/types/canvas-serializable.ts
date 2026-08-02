/**
 * JSON-serializable value used by persisted Canvas extension fields.
 *
 * Kept outside canvas.ts so low-level narrative snapshot contracts can depend on
 * serializable payloads without depending on the full Canvas document model.
 */
export type CanvasSerializableValue =
  | string
  | number
  | boolean
  | null
  | CanvasSerializableValue[]
  | { [key: string]: CanvasSerializableValue };

export type CanvasSerializableRecord = {
  [key: string]: CanvasSerializableValue;
};
