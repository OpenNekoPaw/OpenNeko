---
name: neko-quality-review
description: Use after non-trivial code changes in Neko Suite, when reviewing PRs, or when asked to run a repository quality review. Applies the current Neko development and quality rules to classify risk, inspect architecture boundaries, choose validation commands, and produce review findings with verification and residual risk.
---

# Neko Quality Review

Use this skill after implementing or modifying code in this repository, and whenever the user asks for code review, quality review, PR readiness, CI readiness, UX/performance review, or architecture gate checks.

Source of truth:

- `docs/architecture/development-quality.md`
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
   - `L3`: Node/FFmpeg, media streams, rendering, project formats, AI workflow, packaging.
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
   - Interface: are types, messages, schemas, and package-owned contracts minimal and stable?
   - Extension: will the next similar feature avoid broad edits or duplication?
   - Testing: what is covered by unit, integration, build smoke, an isolated Electron Desktop scenario, or explicit residual risk?

5. Run or recommend validation by impact:

   ```bash
   pnpm ci:local
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

   For implemented user-visible UI behavior, use `neko-ui-validation` to derive the affected function inventory and produce focused functional, visual, and adjacent-regression evidence. Treat a failed or blocked UI result as an advisory finding or follow-up, not a blocking code finding, unless the same defect is independently established by a functional, contract, security, or code-gate failure. Renderer/Webview behavior that crosses focus, CSP, media preview, host messaging, native resources, or lifecycle boundaries should still use an isolated Electron Desktop fixture through the production package or controlled app runtime; browser-only evidence cannot prove those boundaries.

## Review Checklist

Always check:

- No new production `any`, unsafe `as Type`, or formal logging via `console.log`.
- No circular dependency or broken layer direction.
- No overdesign for the local Electron Desktop plus Node/FFmpeg product boundary: avoid speculative interfaces, factories, registries, strategies, plugin hooks, feature flags, config layers, protocol layers, or generic platform scaffolding without a current caller, real external provider, release, or trust boundary.
- No overdefense that hides defects: broad `try/catch`, silent defaults, fallback success, repeated validation, no-op guards, retries, caches, or circuit-breaker-style logic must protect a real Desktop renderer/preload/Main, local file, Node/FFmpeg process, media, external provider, user-data, release, or security boundary and fail visibly for development errors.
- Fail-visible defect handling is enforced: missing implementations, contract mismatches, unreachable states, illegal messages, unknown schema values, bad configuration, missing dependencies, or unregistered handlers/renderers/adapters throw, return typed diagnostics, or fail tests visibly instead of returning empty data, success defaults, no-ops, or silent degradation.
- Renderer/Webview code does not import Electron, Node APIs, or Desktop Main/preload implementations.
- Desktop Main code does not import React/ReactDOM or Webview implementations.
- Renderer and feature packages do not duplicate Node/FFmpeg or owning-domain authoritative computation.
- Paths are relative or `${VAR}/path`, not hard-coded absolute paths.
- File/document/media/model/thumbnail/preview/proxy/import/export/transfer changes use `ContentReadService`, `ContentRepresentationService`, `PathResolver`, `ProjectFileStore`, an owning authorized writer, or the narrow `@neko/media` port as appropriate. Feature packages do not create package-local cache managers, path resolvers, Webview URI projectors, file-token policies, or cache manifest readers.
- Derived storage is transparent and rebuildable: business logic, Agent tools, Webviews, Canvas nodes, composite artifacts, clipboard payloads, and cross-package transfer payloads must not use physical cache layout, manifests, materialized paths, Renderer URLs, opaque runtime tokens, or scratch paths as durable identity.
- Renderer-safe projections are produced only by an authorized Host content projection and exact-resource registration. Projection failure returns a typed diagnostic or fails closed; it does not expose a raw local, cache, or source path.
- Content-path acceptance is path-level acceptance: tests should assert the canonical service/provider/message/adapter was hit and prove direct fs reads, cache-path lookup, package-local path conversion, or Webview URI bypass did not produce a successful result.
- Async flows handle errors, cancellation, resource disposal, and races.
- Public contracts include tests or clear validation evidence.
- Residual/debt terms are scanned and classified. New matches are removed, renamed, or recorded in the appropriate machine-readable debt ledger with owner, replacement, validation, and removal criteria.
- Redundant code is checked within the package and across adjacent packages: unused exports/files, duplicated helpers, repeated adapters, repeated protocol/message handlers, duplicated components, copied tests, and package-local implementations that should be shared.
- Cross-cutting behavior includes shared foundation audit evidence: style/theme/i18n/logger/error/config/path/file IO/resource/contract changes reused or updated `@neko/shared`, `@neko/ui`, `@neko/host`, `@neko/content-domain`, `@neko/media`, or the owning domain before adding package-local logic.
- No package-local parallel design system, theme token set, i18n runtime, logger/error taxonomy, project file IO, cache manager, path resolver, media client, or shared contract copy unless the owning boundary, extraction criteria, and validation command are documented.
- Reusable package capability patterns include cross-package reuse audit evidence: checked adjacent packages and shared layers for providers, registries, bridges, protocols, message routers, status bars, tree views, file decorations, history, selection, recent items, projectors, facades, command routers, capability providers, store slices, workflow adapters, or reusable tests before adding package-local capability code.
- No copied implementation from another feature package and no direct import of another feature package's internals; reuse goes through shared packages, public subpaths, command/API facades, ports, provider registries, or domain services.
- New Webview/React components include component reuse audit evidence: checked `@neko/ui`, owning-package components/hooks/shared modules, adjacent domains, and tests; explained why enhancing an existing component would be unsafe or too coupled.
- Breaking internal changes update the complete producer/consumer boundary atomically and state how valuable user data and published/trust boundaries remain protected.
- Path acceptance is not result-only acceptance. Tests assert the canonical owner, handler, renderer, adapter, and contract, while generic invalid inputs fail at the smallest owning boundary without encoding removed implementation history.
- Long-lived docs are updated only when system architecture, development policy, or core product design changes; public usage belongs in a short package README, while behavior and implementation status remain in code and tests.

Add domain checks as needed:

- Webview/UX: component reuse audit, layout, theme, focus, keyboard, i18n, and runtime evidence from an isolated Electron Desktop fixture; browser-only screenshots do not count as Desktop IPC/lifecycle acceptance evidence.
- UI reference review: when run, inspect the `neko-ui-validation` applicability decision, acceptance inventory, authoritative runtime, functional and visual results, adjacent regression evidence, and residual risk. Report findings accurately without making this advisory review a code gate.
- Node/media: focused package tests, FFmpeg/ffprobe fixture or smoke, resource disposal, and performance evidence when relevant.
- Wire/shared: package-owned producer and consumer use the same canonical contract and preserve runtime isolation.
- Agent/AI: tool contracts, permissions, Journal/traceability, failure recovery, and whether the change triggers `neko-agent-evaluation`. When triggered, check focused canonical-path evidence, forbidden-fallback evidence, assertion support in the current runner, and either a real Desktop complete-session result or an explicit blocking condition with residual risk. Protocol-only, mock-only, or final-text-only results do not count as Agent behavior acceptance.
- Content access/path: canonical locator transfer, bounded Host reads, authorized writes, transparent derived storage, authorized Renderer projection, and path containment.
- Assets: manifest and locator contracts, path safety, derived projection invalidation, and trust boundaries.

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
