## Implementation evidence

Date: 2026-08-23

Status: ComfyUI API/Generation/Agent vertical slice implemented; the change remains active because
resource handoff, Computer Use production wiring and real-runtime acceptance are still open.

## Canonical paths established

- Management: current Extensions scene -> unique Skill/MCP/Professional Applications selector -> active
  package-owned Root -> Window-bound renderer runtime -> typed preload/Main request -> host-neutral
  Professional Apps service. Inactive package Roots are not retained.
- Qualified discovery: ComfyUI product profile -> exact macOS bundle identity probe and explicit loopback
  `/system_stats` probe. The adapter does not enumerate arbitrary executables or applications.
- Native selection: sender-bound Window -> Electron application picker -> Main-only macOS bundle
  inspection -> exact profile identity validation -> Professional Apps binding owner. Cancellation does
  not write, ordinary Renderer configuration cannot replace the locator, and no absolute application
  path crosses preload or enters persistence.
- API core: Generation-owned ComfyUI adapter -> exact `/prompt` `prompt_id` -> exact history/queue state ->
  exact cancellation decision -> history-owned `/view` output descriptor.
- Generation execution: frozen workflow plus exact `ContentLocator` input bindings -> authorized byte
  materialization/upload -> recoverable Generation Job -> exact external `prompt_id` -> verified output
  bytes and Generation-owned provenance. Workflow jobs do not fabricate a model identity or Canvas recipe.
- Agent execution: the official `openneko.generation` DSH Tool exposes an explicit `submit-comfyui`
  operation. Desktop injects the configured loopback endpoint and routes it through the same Generation
  application runtime and Job store instead of creating a second ComfyUI controller.
- API and Computer Use operations remain separately qualified. An unavailable API operation is not
  replaced by a visual operation, and visual evidence cannot prove prompt/output completion.

## Deterministic verification

Passed:

```text
pnpm check:package-roles
pnpm check:package-boundaries
pnpm --filter @neko/professional-apps-contracts typecheck
pnpm --filter @neko/professional-apps-contracts test                 # 8 tests
pnpm --filter @neko/professional-apps-node typecheck
pnpm --filter @neko/professional-apps-node test                      # 6 tests
pnpm --filter @neko/professional-apps-webview typecheck
pnpm --filter @neko/professional-apps-webview test                   # 4 tests
pnpm --filter @neko/generation typecheck
pnpm --filter @neko/generation test                                  # 31 files, 180 tests
pnpm --filter @neko/generation-dsh-plugin test                       # 2 tests
pnpm --filter @neko/agent-runtime typecheck
pnpm --filter @neko/agent-runtime test                               # 54 files, 376 tests
pnpm --filter @neko/agent-runtime exec vitest run \
  src/acp/domain-tool-host-adapters.test.ts                          # 15 focused tests
pnpm --filter @neko/canvas-domain typecheck
pnpm --filter @neko/canvas-domain test                               # 38 files, 317 tests
pnpm --filter @neko/app-desktop typecheck
pnpm --filter @neko/app-desktop exec vitest run \
  src/main/desktop-professional-application-host.test.ts \
  src/main/desktop-professional-application-adapters.test.ts \
  src/renderer/desktop-professional-application-runtime.test.ts      # 3 files, 10 tests
pnpm test:agent:eval                                                 # 45 files, 314 tests; 27 suites/84 cases dry-run
pnpm exec openspec validate integrate-comfyui-professional-application --strict
git diff --check
```

`pnpm check:package-roles` and `pnpm check:application-boundaries` passed. The fixture portion of
`pnpm check:package-boundaries` passed, but the aggregate command is blocked by an unstaged Settings
change importing `@neko/ai-contracts` without declaring that dependency in the Desktop manifest. That
change is outside the professional-application batch.

The isolated staged snapshot passes Desktop `typecheck` and all 10 focused Professional Apps Desktop
tests. A full Desktop package run completed 664 of 666 tests; the two failures are assertions for
Settings and Character/World CSS that belong to concurrently modified, unstaged presentation work.

Repository-wide `pnpm check:no-internal-versioning` is not a pass for this dirty shared worktree. Its 13
auditor tests pass, while the source audit reports stale allowance records and findings in concurrently
modified Agent/Content/Host/scripts files.
The professional-app contracts preserve external ComfyUI release facts as vendor release metadata and do
not add an internal contract/schema generation field or dispatch path.

## UI validation disposition

The UI change is material, so `neko-ui-validation` applies. The package-level component tests in this
batch prove the following advisory inventory only:

- the ComfyUI card remains visible when its probe fails and displays a local diagnostic;
- only an explicit HTTP loopback endpoint can be saved;
- default workflow binding and reuse/new-instance launch preference are editable while vendor identity,
  transport and evidence policy remain product-owned;
- the user can select or reselect a macOS application through a native action; cancel leaves the card
  unchanged, while Main returns only the verified application identity;
- the UI states that detection never installs an application, Skill, MCP server, node or model.

Desktop composition and shared Skill/MCP/Professional Applications presentation are implemented by the
separate extension-management UI batch. Its accepted presentation requirements are recorded in the
canonical [`extension-management-responsive-presentation`](../../specs/extension-management-responsive-presentation/spec.md)
specification. OS application selection/permission flow, exact-window
Computer Use controls and a real Agent provider path remain task 6.4.

## Real ComfyUI fixture

The local fixture became available during validation and was exercised without installing or launching
anything:

- macOS Comfy Desktop `1.0.39` (`CFBundleVersion=2608157nmgcimgp`), exact bundle identity
  `com.todesktop.241012ess7yxs0e`;
- the production Main native inspector read that same exact bundle identity from the installed Comfy
  Desktop application; its returned binding fact contained no filesystem path;
- local ComfyUI `0.33.3`, frontend `1.49.6`, MPS device, explicit endpoint
  `http://127.0.0.1:8188`;
- `/object_info/EmptyImage` and `/object_info/SaveImage` confirmed the two built-in nodes used by the
  model-free fixture;
- direct exact API fixture submitted prompt `3ab080d4-3d64-49c4-a31d-530bb4456c85`, observed completed
  history, and retrieved a 408-byte `image/png` with SHA-256
  `0d06298b8353a47bf3e442ec6bfee0d78c91b9dc580db973c2993cbf32c99bb2`;
- the repository's `ComfyUiLocalApi`, `ComfyUiWorkflowRunner`, in-memory Generation Job store and
  `GenerationJobCoordinator` submitted Job `1db2a1b5-be31-4ff2-8135-e6fc6c81589a`, recorded exact prompt
  `6067d02e-ca58-490d-805b-74902f1ca03a`, reached `succeeded`, and committed a 404-byte `image/png` with
  SHA-256 `326512582e2ba4e2f6c0fa304ecb10c0d0500c4c8e7d7aefea087cac54e5d98b` through a bounded fixture
  committer.

The two workflows intentionally created `OpenNeko_ComfyUI_Verification_00001_.png` and
`OpenNeko_Job_Verification_00001_.png` in ComfyUI's configured output area. Task 6.3 remains open because
this fixture did not safely force a cancellable pending/running prompt, exercise authorized input upload,
run the persistent Desktop owner, or perform explicit Assets ingest.

## Residual risks and intentionally unavailable paths

- Native macOS application selection is implemented for qualified profiles. Opaque bookmark grants,
  variable-backed application paths, revocation and invalid-binding local reset diagnostics remain open.
- The semantic handoff service and strict `ContentLocator` contract exist, but the current Asset Center
  projection does not expose an authoritative owning revision/candidate identity. Resource detail and
  context-menu callers therefore remain unwired instead of deriving identity from modification time,
  fingerprint or “latest”; Desktop does not advertise `comfyui.send-input` as ready.
- The ComfyUI HTTP core is bound to recoverable Generation Jobs and the DSH Generation Tool. WebSocket
  progress, explicit candidate review and Assets-owned ingest are not implemented; queue/history polling
  remains the current exact-prompt observation path.
- The exact-target Computer Use kernel and no-fallback Agent evaluation are retained, but the official
  DSH Computer Use contribution and Desktop provider are not yet wired as the ComfyUI production consumer.
- Desktop advertises ComfyUI API execution only when the endpoint probe succeeds and the Generation
  execution adapter is actually composed. It does not advertise Computer Use or resource handoff early.
- No automatic installation path exists for ComfyUI, companion Skill/MCP contributions, nodes, models or
  dependencies. Other professional applications, Office and Live2D remain unsupported profiles.
