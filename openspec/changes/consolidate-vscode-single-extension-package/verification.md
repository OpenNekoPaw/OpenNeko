## Verification

Date: 2026-07-29

### Passed

- `pnpm --dir apps/neko-vscode typecheck`
- `pnpm --dir apps/neko-vscode test`
  - Node suites: 39 passed
  - Vitest: 156 files, 1022 tests passed
- `pnpm --dir apps/neko-vscode exec vitest run
src/features/tools/media-diff/services/GitMediaService.test.ts`
  - 2 passed; a disabled built-in Git extension is treated as an unavailable
    optional integration, and later enable/disable transitions connect and
    release repository listeners
- `pnpm --dir apps/neko-vscode exec vitest run
src/features/assets/services/SemanticSourceDiscoveryService.test.ts`
  - 4 passed; the document-symbol provider now applies semantic exclusion
    policy to the root-relative source path instead of leaking an absolute Host
    path into the portable-path contract
- `pnpm --dir apps/neko-vscode compile`
  - all five Webview builds, six app-owned resource roots, the 20.1 MB
    Extension Host bundle, and the development Sharp closure completed
- focused application contract suites:
  - Host Kernel, lazy capability, contribution and invocation: 17 passed
  - feature context, six-feature port wiring/lifecycle, AI Host port wiring,
    and state layout: 17 passed
  - VS Code capability availability adapter: 2 passed
- `node scripts/check-application-boundaries.mjs --self-test`
  - 8 architecture fixtures passed, including the reusable-feature-package
    `vscode` rejection case
- `node scripts/check-application-boundaries.mjs`
  - 2651 application/package files checked with zero findings
- `pnpm test:local:vscode`
  - 4 passed; the canonical local launch contains only `Debug Dev (All)`
- `node --test scripts/test-orchestration/media-runtime-closure.test.mjs`
  - 9 passed, including Homebrew symlink source materialization
- `node scripts/stage-openneko-dev-extension.mjs`
  - directly staged the application at `.tmp/openneko-vscode-dev`
- `pnpm build`
- `pnpm test`
  - 27 of 27 workspace tasks passed
- `pnpm check`
  - `knip` passed
  - dependency-cruiser passed with 1206 modules and 4048 dependencies
- `pnpm check:legacy-debt`
- `pnpm check:quality`
  - single-extension, application, Agent, Webview, strict TypeScript,
    local-metadata, test-orchestration, and other configured boundaries passed
  - strict OpenSpec validation passed for all 76 items, including the independent
    `decompose-neko-shared-ownership` successor
  - the cleanup ledger retained three pre-existing warnings
- `pnpm format:check`
- `git diff --check`
- `pnpm test:agent:eval`
  - key-free harness: 40 files and 282 tests passed
  - all-suite dry run: 24 suites and 53 cases passed
  - this is harness evidence, not a real-provider Agent behavior acceptance

The architecture guards prove that the repository has one VS Code extension
manifest/entry, a flat `apps/*` and `packages/*` workspace graph, no internal
feature VSIX assembly, no simulated feature `ExtensionContext`, no embedded
feature registry, and no successful retired Engine product path.

An isolated Extension Development Host was launched through `Debug Dev (All)`
with all unrelated extensions disabled and the synthetic `${HOME}/Git/neko-test`
workspace. It loaded the single `neko.neko-suite` extension, exposed the retained
Media/Entities, Cut and Agent contributions, opened the owned
`h264-pcm.otio` fixture, and advanced playback from zero to 2.18 seconds while
the control changed to pause. The Agent view, input and model controls were also
visible. This is no-port black-box Host UI evidence; it is not Webview DOM/CSP
or installed-final-VSIX evidence.

After production lazy wiring, the same isolated Host loaded the Agent view
through `neko.capability.agent-runtime`. CDP target discovery observed two VS
Code page targets and five Webview targets. The Agent iframe belonged to
`neko.neko-suite`, rendered `OpenNeko 创作助手`, model and input controls, and
its console contained only VS Code's documented benign
`local-network-access` warning. The focused lazy-surface tests prove application
registration leaves the capability `idle`, the first command starts exactly
one runtime, a failed start renders the capability ID/error code/causal chain,
and the independent focus entry remains callable.

### Agent Evaluation scope

- Change/feature: VS Code Agent surface activation and Host runtime ownership.
- Decision and owning suite: `excluded` from provider-backed TUI behavior
  evaluation. The changed VS Code composition, lazy surface and command bridge
  paths are not selected by the strict change-to-suite map because they do not
  change Pi prompt, model, Tool, session or TUI behavior.
- Canonical path: VS Code Agent command/view → typed contribution →
  `neko.capability.agent-runtime` → `startNekoAgentRuntime`.
- Forbidden fallback: eager `createOpenNekoAiHostRuntime`, direct Agent runtime
  activation during feature registration, embedded registry discovery, or
  successful no-op after capability failure.
- Deterministic/Host evidence: production source path assertion, focused
  lazy-surface success/failure tests, application typecheck/compile, isolated
  Extension Development Host, and Agent iframe/console inspection.
- Key-free validation: `pnpm test:agent:eval` passed 40 files/282 tests and the
  24-suite/53-case dry run.
- Real provider cases: not executed because the Agent behavior under test is
  unchanged and the indexed real TUI suites cannot prove a VS Code Host
  activation boundary. No model-output quality claim is made.
- Residual risk: the installed-final-VSIX happy path, disposal, and injected
  lazy-capability-unavailability path passed on Darwin. Linux still has
  artifact/closure evidence rather than Linux-native installed Host evidence.

### Darwin final VSIX acceptance

The pinned FFmpeg 8.1.2 source bundle was downloaded, checksum-verified, and
built as the owned LGPL `darwin-arm64` media runtime. Packaging then produced:

- artifact: `vsix-artifacts/OpenNeko-darwin-arm64-0.0.1.vsix`
- SHA-256:
  `c78a14d9a2c6f7ba99ed550998fbf586b624f3dd0653338127cfddca4d28147f`
- archive: 231 files, no nested VSIX, no internal extension payload
- runtime: FFmpeg and FFprobe are Mach-O arm64 binaries; descriptor checksums,
  required VideoToolbox/codecs/filters, runtime qualification, and the
  six-module application closure passed
- dynamic linkage: system libraries/frameworks only

The final artifact was installed outside both the repository and system
temporary directory with isolated user data and extensions. Extension listing
contained only `neko.neko-suite@0.0.1`; no
`--extensionDevelopmentPath` was used. VS Code 1.130 activated the extension
through `onCommand:neko.ai.chat`.

The installed Agent iframe belonged to `neko.neko-suite`, rendered the expected
controls, used the packaged Agent script/style paths, and exposed the expected
CSP. The installed Cut custom editor opened `cut-basic.otio`, rendered its
131.63-second/two-track timeline, and loaded its script/style from the packaged
Cut resource root. After the semantic-path correction and rebuild, the exact
artifact identified by the SHA-256 above was reinstalled into another isolated
profile and the Cut path was repeated. Playback advanced from 0 to 4.85
seconds; the active video reported `readyState=4`, `networkState=1`, no media
error, and a canvas was present. The Extension Host log recorded
`onCustomEditor:neko.cut.otioEditor` activation with no semantic-path or
provider failure. This proves the final package's Node/FFmpeg/media and Webview
resource paths on Darwin, not merely development staging.

The synthetic workspace intentionally disables the built-in Git extension. The
installed package no longer reports `Git model not found`; the optional Tools
integration remains inactive until Git is enabled. On shutdown the Extension
Host terminated normally and exited with code 0, with no Neko disposal error.

### Linux x64 final VSIX build and inspection

The pinned FFmpeg 8.1.2 source bundle was checksum-verified and built in an
isolated Debian amd64 container as the owned LGPL `linux-x64` media runtime.
Packaging on the container-local filesystem then produced:

- artifact: `vsix-artifacts/OpenNeko-linux-x64-0.0.1.vsix`
- SHA-256:
  `10fd69d7671b81f736c1f54ac8c9ea48ab14a603c178b16ae96a3636e2272ddc`
- archive: 278 files, valid compressed data, no nested VSIX, no internal
  extension payload, no build-only `deps/` files, 37.78 MB
- runtime: FFmpeg, FFprobe, Sharp and libvips are x86-64 ELF binaries; the
  descriptor checksum, required VAAPI/codecs/filters, runtime qualification,
  and six-module application closure passed after extracting the final VSIX
- Sharp smoke: the extracted application runtime generated a PNG through the
  packaged Sharp/libvips closure
- dynamic linkage: FFmpeg and FFprobe resolve only the ELF loader, glibc,
  libm, libva, libva-drm and libdrm; Sharp resolves its packaged libvips plus
  standard GNU runtime libraries

Docker Desktop shared mounts were not used for the final staging directory
because their cross-architecture permission projection changed readable files
to mode `0200` inside a later amd64 container. Staging on the container-local
filesystem avoided that environment artifact; no product-code workaround was
introduced. The extracted artifact was independently qualified in a fresh
amd64 container with the declared VAAPI/DRM system libraries installed.

### Installed lazy-capability failure acceptance

The rebuilt `darwin-arm64` final VSIX was installed into a second isolated
extensions directory. Only that installed copy's Agent-owned
`dist/skills` directory was moved out of its canonical location before launch;
the VSIX artifact and the earlier happy-path installation remained unchanged.
The injected path was restored after the scenario.

VS Code loaded the synthetic workspace and retained sibling contributions
before Agent startup. Selecting `Chat with AI` activated
`neko.neko-suite` through `onCommand:neko.ai.chat`, then the lazy Agent runtime
failed at the intentionally missing builtin Skill root. The notification and,
after notification dismissal, the Agent Webview both rendered:

`neko.capability.agent-runtime/initialization-failed`

The diagnostic included the missing Skill root and causal chain
`neko.capability.agent-runtime`. Media & Entities and Entity Inspector remained
operational after the failure, proving the unavailable capability did not
poison an independent feature surface.

This installed scenario also exposed and then verified a sibling-provider
regression: the Assets document-symbol provider had passed an absolute Host
path to the root-relative semantic exclusion policy. The provider now uses its
already-derived relative path, a regression test passes, both platform VSIX
artifacts were rebuilt, and the rebuilt installed Host log contains neither
`Semantic source path must remain root-relative` nor `provider FAILED`.

### Remaining runtime acceptance

Darwin build, archive inspection, installation, Agent/Cut Webview resource and
CSP inspection, target-native media playback, optional-Git behavior, and
disposal have passed. The installed Agent lazy-failure diagnostic and sibling
feature continuity also pass. Both supported platform artifacts have now
passed build, archive, checksum, target-binary and runtime-closure inspection.
One installed runtime acceptance item remains:

- install and run the inspected `linux-x64` artifact in a Linux-native VS Code
  host with its VAAPI/DRM runtime closure.

Task 8.3 is complete. Task 8.4 remains unchecked because an amd64 packaging
container cannot substitute for a Linux-native installed VS Code Host.
