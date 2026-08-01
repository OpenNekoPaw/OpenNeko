## 1. Preserve Content And Consumer Decisions

- [x] 1.1 Remove `ResourceRef` contracts and keep `ContentLocator` as the only general persistent content identity.
- [x] 1.2 Keep locator, representation, domain identity, revision and runtime display projection as separate facts.
- [x] 1.3 Keep path-only Canvas Media/File nodes visible as content-unavailable without inference, migration or document loss.
- [x] 1.4 Keep stale optional Canvas material-action projection from escalating to `canvas.loadFailed`.
- [x] 1.5 Move ordinary Canvas audio/video to package-owned native elements and retain Cut timeline PCM.
- [x] 1.6 Preserve Preview owning viewers and Agent locator-backed display/file-authority separation.

## 2. Replace Transport Contracts

- [x] 2.1 Add red tests that require `openneko://desktop` and `openneko://resource`, poison `neko-app:`, `neko-media:`, `opennekomedia:` and loopback HTTP, and reject persisted runtime URLs.
- [x] 2.2 Remove `MediaTransport`, `transport: 'http'` and HTTP URL validators from `@neko/media` and all package-owned descriptors without adding a second discriminant.
- [x] 2.3 Slim the Node media publication port to exact file and PCM registration; remove resource-set and HTTP gateway semantics from `@neko/media`.
- [x] 2.4 Keep FFmpeg preparation, audio preservation, PCM framing/priming/cancellation and browser media consumers independent of Electron transport.

## 3. Implement The Unified OpenNeko Protocol

- [x] 3.1 Rename the privileged app scheme and production Renderer URL from `neko-app:` to `openneko:`.
- [x] 3.2 Extend the single `protocol.handle('openneko', ...)` to dispatch `desktop` and `resource` hosts with no second protocol handler.
- [x] 3.3 Implement one Desktop exact-resource registry for seekable files, one-shot PCM and frozen dependency sets; do not expose it through preload or a generic content facade.
- [x] 3.4 Implement GET/HEAD, full/open/closed/suffix single Range, 200/206/416, exact MIME/length/revision, streaming backpressure and no whole-file buffering.
- [x] 3.5 Implement PCM priming, single consumption, non-Range behavior, cancellation and exact FFmpeg termination.
- [x] 3.6 Implement normalized exact resource-set dependencies and reject traversal, encoded separators, unknown entries, containment escape and source change.
- [x] 3.7 Bind registrations to `webContentsId` and exact Window/View/session/renderer-epoch/generation; deny mismatched/missing sender context.
- [x] 3.8 Release registrations and in-flight responses on generation replace, View detach, renderer reload, Window close and app quit.
- [x] 3.9 Update CSP/CORS for exact `openneko://resource` access and remove dynamic HTTP origin, PNA and loopback policy.

## 4. Migrate Producers And Consumers

- [x] 4.1 Inject the Desktop resource registry publisher into Cut and preserve original/remux/prepared video plus mixed PCM generation ownership.
- [x] 4.2 Migrate Canvas native audio/video descriptors and bridge validation to transient OpenNeko resource URLs with no ordinary PCM fallback.
- [x] 4.3 Migrate Preview image/audio/video/PDF/GLB/glTF registration and exact session/resource-set release.
- [x] 4.4 Migrate Agent display projection to transient OpenNeko URLs while Pi/provider/Tools retain locator or authorized real path inputs.
- [x] 4.5 Add multi-instance and stale-epoch tests for Cut, Canvas, Preview and Agent owner isolation.

## 5. Remove Replaced Implementations

- [x] 5.1 Delete `DesktopHttpResourceGateway`, production `NodeMediaLoopbackServer` ownership and all HTTP-only gateway tests.
- [x] 5.2 Delete the HTTP qualification launcher/page/contract, dynamic port startup and loopback CSP/CORS/PNA code.
- [x] 5.3 Delete old `neko-app:`, `neko-media:`, `opennekomedia:` and private media scheme success paths, fixtures and architecture claims.
- [x] 5.4 Run legacy/unused checks and repository searches proving no production loopback gateway, dual transport, `ResourceRef`, URL identity or path inference remains.

## 6. Electron Qualification

- [x] 6.1 Add an isolated synthetic OpenNeko qualification scenario for H.264/WAV metadata, play, seek, Range, SHA-256, changing Canvas pixels, repeated WebGL texture upload and cleanup.
- [x] 6.2 Qualify one-shot PCM and client/owner cancellation through the OpenNeko handler.
- [x] 6.3 Qualify image, PDF, GLB and external-resource glTF plus sender isolation between two WebContents.
- [x] 6.4.1 Extend the shared isolated Desktop functional runner with CDP control, console/network capture, timeout, redacted reports, deterministic cleanup, legacy/loopback poison and development/packaged launch targets.
- [x] 6.4.2 Run package-owned real Electron Cut and Canvas scenarios proving their actual Roots, changing/advancing native or PCM consumers, seek/generation/release, no ordinary Canvas PCM and two-View isolation.
- [x] 6.4.3 Run package-owned real Electron Preview scenarios proving the actual image/audio/video/PDF/GLB/glTF viewers, frozen dependency sets and exact session release.
- [x] 6.4.4 Drive the real Desktop Agent complete-session input path through Pi Tool result, Timeline/conversation projection and the package-owned media card; prove the render URL never enters provider/Tool facts, or preserve the exact provider/model/cost infrastructure blocker without mock/direct injection.
- [x] 6.4.5 Aggregate the development and applicable packaged consumer reports, prove the OpenNeko handler and package-owned consumers were hit, and prove every poisoned HTTP/legacy/fallback path remained untouched.
- [x] 6.5 Run packaged `darwin-arm64`; keep native `win32-x64` typecheck/package green and record graphical Windows qualification as Phase 2.

## 7. Documentation And Quality Gates

- [x] 7.1 Update active media/Cut/Canvas/Preview OpenSpec artifacts and architecture docs to the unified OpenNeko scheme.
- [x] 7.2 Update evaluation evidence, preserving the prior HTTP spike only as non-canonical feasibility history.
- [x] 7.3 Run focused `@neko/media`, Desktop, Cut, Canvas, Preview and Agent tests/typechecks.
- [x] 7.3.1 Include Desktop functional `.mjs` sources in Prettier and ESLint gates, retire obsolete ignore entries, and synchronize local qualification commands in Desktop documentation.
- [x] 7.4 Run `pnpm build`, `pnpm test`, `pnpm check`, `pnpm check:quality`, `pnpm check:legacy-debt`, `pnpm check:unused` and `pnpm test:agent:eval`.
- [x] 7.5 Run `pnpm package:desktop`, applicable Electron functional matrices and `neko-quality-review`; record remaining HDR, Windows media and Agent-driver risks.
