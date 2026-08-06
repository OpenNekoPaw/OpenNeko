## 1. Canonical Host document contract

- [x] 1.1 Add Host-owned secret credential and local diagnostic result types with tests proving ordinary `UnifiedConfig` remains secret-free.
- [x] 1.2 Replace cast-and-throw TOML semantic validation with independent canonical field/record decoding; keep only unreadable or malformed TOML document-blocking.
- [x] 1.3 Delete `unsupportedConfigField`, `base_url`, model `protocol`, inert locale fields, override maps and their production/test paths; prove removed paths cannot select runtime behavior.
- [x] 1.4 Preserve valid inline provider API keys only through the Host document writer during explicit canonical writes while dropping unknown and removed fields.

## 2. Local diagnostics and credential consumption

- [x] 2.1 Project owner-qualified recoverable diagnostics without blocking valid sibling providers, models, MCP servers or bindings.
- [x] 2.2 Add exact per-provider credential owner selection in Agent runtime: valid inline keys use the config source, absent keys use SecretStorage, and invalid declared keys fail closed without fallback.
- [x] 2.3 Wire Host credential snapshots to Agent runtime through package public contracts and keep Desktop Main limited to Electron/SecretStorage composition.
- [x] 2.4 Add producer, consumer and secret-redaction tests proving no API key reaches ordinary DTOs, diagnostics, logs, Renderer messages or portable exports.

## 3. Verification and cleanup

- [x] 3.1 Run `pnpm --filter @neko/host test` and `pnpm --filter @neko/host typecheck` with canonical-path and valid-sibling assertions.
      Evidence: Host `35/35` files and `286/286` tests passed; the package has no `typecheck` script, so `pnpm --dir packages/host exec tsc --noEmit` passed instead.
- [x] 3.2 Run affected Agent Runtime, Agent Webview and Desktop tests/typechecks for credential selection, config diagnostics and secret-safe projection.
      Evidence: Agent Contracts `262/262`, Agent Runtime `968/968`, Agent Webview `690/690`, Desktop `393/393`, affected typechecks, root `pnpm test`, and Electron packaging passed.
- [x] 3.3 Run `pnpm check:no-internal-versioning`, `pnpm check:legacy-debt`, `pnpm check:unused`, `pnpm check`, and `git diff --check`; record any unrelated baseline failures.
      Evidence: internal versioning reported zero new occurrences, legacy debt reported zero blocking debt, unused/dependency checks and diff whitespace passed; Knip emitted only existing configuration hints.
- [x] 3.4 Record Agent Evaluation as excluded with deterministic evidence because valid provider/model selection, prompts, tools and sessions are unchanged; document residual real-runtime risk.
      Evidence: Host parsing/credential-source tests, Agent credential/runtime/provider tests and secret-redaction consumer tests cover the changed deterministic path. No Prompt, Tool, model selection or session workflow changed. Current provider/model/cost authorization was unavailable, so no new real-provider call was made; residual risk is limited to an external provider accepting the selected credential, while the existing visible provider Electron evidence remains recorded under `fix-desktop-agent-shell-regressions`.
- [x] 3.5 Complete `neko-quality-review`, verify OpenSpec strictly, mark tasks accurately, and split commits into OpenSpec contract, Host parsing, and Agent credential/diagnostic integration.
