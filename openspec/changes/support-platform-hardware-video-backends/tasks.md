## 1. Contract

- [x] 1.1 Add the shared hardware video strategy and target selection contract.
- [x] 1.2 Extend runtime qualification and descriptor floors for VAAPI.
- [x] 1.3 Update stable media architecture documents to describe target-specific
      backends and the unsupported Windows boundary.

## 2. Implementation

- [x] 2.1 Migrate `NodeMediaRuntime` to the shared strategy.
- [x] 2.2 Migrate `NodeFfmpegCutMediaAdapter` and remove duplicated
      VideoToolbox command/error helpers.
- [x] 2.3 Enable VAAPI/libdrm in the Linux packaged FFmpeg build and install its
      build dependencies in CI/release packaging.

## 3. Tests

- [x] 3.1 Add exact VideoToolbox and VAAPI command-planning tests that reject CPU
      fallback.
- [x] 3.2 Make cache and corruption tests inject their intended backend.
- [x] 3.3 Add descriptor and orchestration tests for the Linux VAAPI capability
      floor.

## 4. Validation

- [x] 4.1 Run focused Media, Cut, descriptor, and orchestration tests.
- [x] 4.2 Build and qualify the Linux runtime in an amd64 Linux environment.
- [x] 4.3 Run `pnpm build`, `pnpm test`, `pnpm check`, legacy-debt, unused, and
      OpenSpec strict gates.
- [ ] 4.4 Push the focused commits and verify PR GitHub Actions.
