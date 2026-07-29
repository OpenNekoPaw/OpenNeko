# Host port inventory

Date: 2026-07-29

The former `OpenNekoAiHostServices` universal bag has been removed. The
application composition root now injects two consumer-owned projections:
`NekoAgentAiHostPort` and `NekoCutHostServices`. They have separate owners and
lifetimes; Cut registration no longer initializes the Agent Host runtime.

The complete retained feature boundary is:

| Feature | Consumer-owned input/output port                                         | Error and lifecycle contract                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tools   | `NekoToolsFeatureActivation`                                             | exposes only async `dispose()`; the internal `ServiceCollection` is not exported and the registration owner awaits disposal                                                   |
| Preview | `NekoPreviewAPI`                                                         | operations reject explicit service/runtime failures; the feature registration owner disposes providers on rollback or shutdown                                                |
| Assets  | `NekoAssetsFeatureExports`                                               | exports only media representation and Agent capabilities; async disposal drains tracked work before clearing runtime state                                                    |
| Cut     | `NekoCutHostServices` → `NekoCutAPI`                                     | optional LocalMetadata is an explicit persistence boundary; registration fails visibly on initialization/recovery failure and async disposal owns the editor provider         |
| Canvas  | `NekoCanvasHostServices` → `NekoCanvasFeatureExports`                    | Preview, Assets and Cut ports are injected directly; operation errors reject and all registered VS Code resources belong to the feature scope                                 |
| Agent   | `NekoAgentHostServices` → `NekoAgentRuntime` / lazy `NekoAgentAPI` proxy | the heavy runtime is capability-owned; initialization failure is poisoned and projected with capability identity and causal chain while independent entrypoints remain active |

| Former member                 | Owner and consumer | Disposition                                                                                          |
| ----------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `platform`                    | Agent              | retained in `NekoAgentAiHostPort`; configuration, provider and media execution runtime               |
| `toolRegistry`                | Agent              | retained in `NekoAgentAiHostPort`; Agent tool registration identity                                  |
| `generationJobs`              | Agent              | retained in `NekoAgentAiHostPort`; durable generation execution port                                 |
| `generatedAssets`             | Agent              | retained in `NekoAgentAiHostPort`; generated-output catalog                                          |
| `resolveGenerationResult`     | Agent              | retained in `NekoAgentAiHostPort`; validates locator revision before resolving                       |
| `localMetadata`               | Cut                | retained in `NekoCutHostServices`; persistent export-job store input                                 |
| `purposeGenerationJobs`       | no consumer        | deleted; Agent resolves purpose bindings through its own platform configuration                      |
| `resolveGenerationResultPath` | no consumer        | deleted; path-only resolution bypassed lifecycle validation and duplicated `resolveGenerationResult` |

The Agent projection is created only inside
`neko.capability.agent-runtime`. Application activation registers the Agent
commands and Webview provider through a typed contribution proxy while the
capability remains `idle`. The first Agent view resolution or Agent command
starts Platform, Agent LocalMetadata, generation coordination and
generated-output projection. The capability owns its child feature scope and
Host runtime; failure rolls both back and projects an unavailable diagnostic
with the capability identity and causal chain.

Cut owns a separate `OpenNekoCutHostRuntime` projection containing only the
LocalMetadata input needed for persistent export-job recovery. Neither
consumer receives the other consumer's port, and no capability locator or
universal services object is exposed.

`feature-port-contracts.test.ts` proves that all six ports remain explicit at
the composition root and that their registration/capability owners receive the
matching disposal path. Host Kernel tests cover activation rejection,
transactional rollback and reverse disposal, while the Agent lazy-surface
tests cover unavailable diagnostics and independent-surface continuity.

The application-boundary check additionally treats the promoted Agent,
Canvas, Cut, Preview and Tools runtime/contract/Webview package roots as
reusable. Any direct `vscode` import in those roots, or any package import of
`apps/neko-vscode`, is a failing architecture diagnostic. Package-owned
explicit L1 adapters such as `@neko/chara/host-vscode`,
`@neko/entity/host-vscode` and `@neko/search/host-vscode` are outside this
change's promoted feature-package set; moving them requires an owner-specific
change rather than silently reclassifying their public subpaths here.
