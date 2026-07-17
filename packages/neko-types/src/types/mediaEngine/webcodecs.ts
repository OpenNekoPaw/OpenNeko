/**
 * WebCodecs type stubs for cross-environment compatibility.
 *
 * These interfaces mirror the WebCodecs API (available in browsers via DOM lib)
 * but are defined locally so non-browser packages (VSCode extensions, Node.js)
 * can reference them without requiring "DOM" in their tsconfig lib.
 *
 * Structurally compatible with the real DOM VideoFrame — any actual
 * VideoFrame object is assignable to this interface via structural typing.
 */

/** Minimal VideoFrame interface compatible with the WebCodecs API VideoFrame. */
export interface VideoFrame {
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly timestamp: number;
  close(): void;
}
