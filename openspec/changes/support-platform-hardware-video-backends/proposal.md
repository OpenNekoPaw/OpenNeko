# Change: Support platform hardware video backends

## Why

The Node media runtime and Cut adapter currently model the hardware video
backend as `videotoolbox | unavailable`. That makes a macOS implementation look
like the cross-platform contract. Linux packages are built and shipped, but
their hardware frame capture and incompatible-codec preparation cannot select a
Linux hardware pipeline. Platform-neutral tests also inherit the host default,
which caused Ubuntu CI to fail before reaching the behavior under test.

## What Changes

- Move hardware decode, scale/color conversion, H.264 encode, bounded frame
  readback, and backend error classification into one `@neko/media/node`
  strategy boundary.
- Select VideoToolbox on `darwin-arm64` and VAAPI on `linux-x64`.
- Require the packaged FFmpeg descriptor to prove the encoder and filter
  capabilities for its declared backend.
- Make Media and Cut tests inject the backend whose behavior they assert.
- Keep software video decode, scale, tone-map, and encode fallback forbidden.
- Keep Windows outside the current release target list. A future Windows target
  must add a qualified complete QSV, AMF, NVENC, or other hardware closure
  through the same strategy boundary; D3D11VA decode alone is insufficient.

## Impact

- Affected code: `packages/neko-media`, `packages/neko-cut`,
  `scripts/media-runtime-closure.mjs`, `scripts/build-media-runtime.sh`, and
  platform packaging workflows.
- Affected contracts: media runtime qualification and packaged runtime
  capability floors.
- No Webview message, HTML video descriptor, PCM, project data, or user path
  format changes.
- The media runtime descriptor advances to v2. Existing development runtime
  stages must be rebuilt; no user project data is migrated or discarded.
