---
name: neko-quality-review
description: Use after non-trivial code changes in Neko Suite, when reviewing PRs, or when asked to run a repository quality review. Applies the Neko code review and quality gates ADR to classify risk, inspect architecture boundaries, choose validation commands, and produce review findings with verification and residual risk.
---

# Neko Quality Review

Use this skill after implementing or modifying code in this repository, and whenever the user asks for code review, quality review, PR readiness, CI readiness, UX/performance review, or architecture gate checks.

Source of truth:

- `docs/architecture/adr-code-review-quality-gates.md`
- `docs/architecture/application-composition.md`
- `docs/architecture/package-boundaries.md`
- `AGENTS.md`

## Workflow

1. Inspect the change set:

   ```bash
   git diff --name-only
   git diff --stat
   ```

2. Classify risk:
   - `L0`: docs, copy, low-risk single-file fix.
   - `L1`: local component, hook, service, or state logic.
   - `L2`: renderer/preload/Main messaging, shared packages, media ports, imports/exports, public types.
   - `L3`: Rust engine, Proto, media streams, rendering, project formats, AI workflow, packaging.
   - `L4`: release, install/packaging, major UX, core creative workflow.

3. Review architecture before implementation details:
   - Does it fit the existing architecture?
   - How does it reduce coupling?
   - Is it easy to extend and test?
   - Is the complexity proportional to a local Electron Desktop plus local Node/FFmpeg runtime?
   - Does defensive code protect real boundaries instead of hiding development errors?
   - Do code defects and contract violations fail visibly instead of falling back, defaulting, or no-oping?

4. For multi-module changes or new functionality, apply the five-layer analysis:
   - Responsibility: who owns data, behavior, and lifecycle?
   - Dependency: are L0/L1/L2 and renderer/preload/Main/Node boundaries respected?
   - Interface: are types, messages, schemas, and Proto contracts minimal and stable?
   - Extension: will the next similar feature avoid broad edits or duplication?
   - Testing: what is covered by unit, integration, build smoke, an isolated Electron Desktop scenario, or explicit residual risk?

5. Run or recommend validation by impact:

   ```bash
   pnpm ci:local
   ```

   For Rust changes:

   ```bash
   pnpm ci:local:rust
   ```

   For Proto changes:

   ```bash
   pnpm ci:local:proto
   ```

   If a narrower package command is enough, prefer the smallest reliable command and state why.

   For residual/debt and redundancy checks:

   ```bash
   pnpm check:legacy-debt
   pnpm check:unused
   ```

   For integration smoke checks:

   ```bash
   pnpm smoke:webview
   pnpm package:desktop
   ```

   For Agent Evaluation platform, scenario, debug automation protocol, or exported fact-contract changes, run the key-free harness gate documented by the platform. This is not real Agent behavior acceptance. If the change can alter prompt or Skill behavior, capability/tool registration or routing, provider/model selection, AgentSession multi-turn/queue/async/recovery behavior, or Desktop Agent event projection, use `neko-agent-evaluation` to produce focused path-level evidence. Review the recorded blocking condition and residual risk when a real case could not run. Do not infer that scenario assertions passed unless the current runner executed an evaluator for them.

   For renderer/Webview visual, layout, interaction, focus, CSP, media preview, or lifecycle changes, build the affected package and validate an isolated Electron Desktop fixture through the production package or controlled app runtime. Use Computer Use for visible interaction evidence when required. A generic browser or Vite page may assist explicit browser-compatibility work, but it does not exercise preload, typed IPC, Electron CSP, window focus, or Desktop resource lifecycle.

## Review Checklist

Always check:

- No new production `any`, unsafe `as Type`, or formal logging via `console.log`.
- No circular dependency or broken layer direction.
- No overdesign for the local-client/local-engine product boundary: avoid speculative interfaces, factories, registries, strategies, plugin hooks, feature flags, config layers, protocol layers, or generic platform scaffolding without a current caller, real external provider, release, or trust boundary.
- No overdefense that hides defects: broad `try/catch`, silent defaults, fallback success, repeated validation, no-op guards, retries, caches, or circuit-breaker-style logic must protect a real Desktop renderer/preload/Main, local file, Node/FFmpeg process, media, external provider, user-data, release, or security boundary and fail visibly for development errors.
- Fail-visible defect handling is enforced: missing new implementations, contract mismatches, unreachable states, illegal messages, unknown schema/version values, bad configuration, missing dependencies, or unregistered handlers/renderers/adapters throw, return typed diagnostics, or fail tests visibly instead of returning empty data, success defaults, no-ops, silent degradation, or old compatibility behavior.
- Renderer/Webview code does not import Electron, Node APIs, or Desktop Main/preload implementations.
- Desktop Main code does not import React/ReactDOM or Webview implementations.
- TypeScript does not duplicate Rust engine authoritative computation.
- Paths are relative or `${VAR}/path`, not hard-coded absolute paths.
- File/document/media/model/thumbnail/preview/proxy/import/export/transfer changes use the owning shared boundary: content access, resource cache, local resource access, EngineClient/file access, path resolver, ingest, or project-file service. Feature packages provide provider/adapter/domain semantics; they do not create package-local cache managers, path resolvers, Webview URI projectors, Engine file-token policies, or cache manifest readers.
- Cache is transparent and rebuildable: business logic, Agent tools, Webviews, Canvas nodes, Storyboard rows, composite artifacts, clipboard payloads, and cross-plugin transfer payloads must not use `.neko/.cache` layout, cache manifests, materialized cache paths, `cachePath`, `runtimePath`, `cacheResourceRef`, Webview URI, blob/object URL, Engine token, preview token, or scratch/temp paths as durable identity.
- Webview-safe URIs are produced only by `LocalResourceAccessService` or `ResourceCacheService.project()` after authorization. Projection failure returns typed diagnostics, omits renderable projection, or fails closed; it does not fall back to raw local/cache/source paths.
- Content-path acceptance is path-level acceptance: tests should assert the canonical service/provider/message/adapter was hit and prove direct fs reads, cache-path lookup, legacy field fallback, package-local path conversion, or Webview URI fallback did not produce a successful result.
- Async flows handle errors, cancellation, resource disposal, and races.
- Public contracts include tests or clear validation evidence.
- Residual/debt terms are scanned and classified: `legacy`, `fallback`, `deprecated`, `compat`, `shim`, `dirty`, `hack`, `temporary`, `workaround`, `dead code`, `unused`, and `duplicate`. New matches are removed, renamed, or recorded in the appropriate debt ledger with owner, replacement, validation, and removal criteria.
- Redundant code is checked within the package and across adjacent packages: unused exports/files, duplicated helpers, repeated adapters, repeated protocol/message handlers, duplicated components, copied tests, and package-local implementations that should be shared.
- Cross-cutting behavior includes shared foundation audit evidence: style/theme/i18n/logger/error/config/path/file IO/resource/cache/DTO changes reused or updated `@neko/shared`, `@neko/ui`, `@neko/neko-client`, `@neko/proto`, entity/search services, project-file-io, resource cache, or a domain service before adding package-local logic.
- No package-local parallel design system, theme token set, i18n runtime, logger/error taxonomy, project file IO, cache manager, path resolver, Engine HTTP/WS client, or shared DTO copy unless the owning boundary, extraction criteria, and validation command are documented.
- Reusable package capability patterns include cross-package reuse audit evidence: checked adjacent packages and shared layers for providers, registries, bridges, protocols, message routers, status bars, tree views, file decorations, history, selection, recent items, projectors, facades, command routers, capability providers, store slices, workflow adapters, or reusable tests before adding package-local capability code.
- No copied implementation from another feature package and no direct import of another feature package's internals; reuse goes through shared packages, public subpaths, command/API facades, ports, provider registries, or domain services.
- New Webview/React components include component reuse audit evidence: checked `@neko/ui`, owning-package components/hooks/shared modules, adjacent domains, and tests; explained why enhancing an existing component would be unsafe or too coupled.
- Prelaunch breaking changes identify what breaks, the old-data strategy, and why compatibility shims are removed. New canonical paths delete or isolate legacy adapters, fallback branches, dual-read/dual-write paths, old field mappings, and legacy command aliases unless they protect valuable data or published/trust boundaries.
- Prelaunch refactors enforce cleanup order inside the scoped replacement boundary: old successful call chains are disconnected, deleted, isolated, or fail-closed before the new design/contract is wired and accepted.
- Review does not reward continued old-path bug fixing when the selected replacement boundary should already be moving to the new canonical path.
- Development and validation defaults disable compatibility fallback for new paths. A legacy-path hit during new-path development or validation must throw, return a fail-closed diagnostic, or emit assertable telemetry/log failure instead of returning a legacy success result.
- Only migration, rejection, or diagnostic tests may intentionally observe retained legacy paths; new-path acceptance tests must assert that retained legacy paths cannot return success or mask new-path failure.
- New-path acceptance is path-level acceptance, not result-only acceptance. Tests must assert the canonical path, new handler, new renderer, new adapter, or new contract was hit, and prove retained legacy paths did not participate with a spy, counter, log assertion, or poisoned legacy path that throws.
- Retained compatibility paths have owner, replacement, validation command, removal condition, expiry task, and tests proving they cannot mask new-path failure.
- Docs are updated when behavior, architecture, config, package entry points, or public contracts change.

Add domain checks as needed:

- Webview/UX: component reuse audit, layout, theme, focus, keyboard, i18n, and runtime evidence from an isolated Electron Desktop fixture; browser-only screenshots do not count as Desktop IPC/lifecycle acceptance evidence.
- Engine/media: `cargo test`, CLI smoke, `serve` integration, performance before/after when relevant.
- Proto/shared: generated types are synchronized and callers are migrated.
- Agent/AI: tool contracts, permissions, Journal/traceability, failure recovery, and whether the change triggers `neko-agent-evaluation`. When triggered, check focused canonical-path evidence, forbidden-fallback evidence, assertion support in the current runner, and either a real Desktop complete-session result or an explicit blocking condition with residual risk. Protocol-only, mock-only, or final-text-only results do not count as Agent behavior acceptance.
- Content access/cache/path: intent-aware access, transparent resource cache, path variable resolution, Engine-backed binary/media reads, Host text/project-file reads, authorized Webview projection, and stable `ResourceRef`/source-ref transfer.
- Assets/market: manifest/schema compatibility, path safety, cache invalidation, trust boundaries.

## Output Format

For review findings, lead with issues:

```text
Findings
- Blocking: [file:line] Problem. Impact. Suggested fix.
- Suggestion: [file:line] Problem. Impact. Suggested fix.

Verification
- Ran: ...
- Not run: ... (reason)

Residual Risk
- ...
```

If there are no findings, say so clearly and still report test gaps or residual risk.

For post-implementation self-review, summarize:

- Risk level and affected areas.
- Key architecture/contract decisions.
- Validation performed.
- Remaining follow-up, especially engine CLI smoke, `serve` integration, Webview runtime smoke, UX evidence, or performance baselines.
