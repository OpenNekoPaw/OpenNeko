# Headless Project Authoring Boundary

Neko `nk*` project files are durable creative facts. Host-originated writes to those facts must be executable without an open Webview, visible custom editor, or UI snapshot. Webviews remain important interactive projections, but they are not the production executor for Agent, Assets, TUI, Electron, or background authoring.

This boundary extends the Canvas headless authoring model to other project-file packages such as Cut, Sketch, Audio, and Model.

## Operation Classes

Every package command, API, Agent capability, or transfer target that touches editor state must declare one of these classes:

| Class | Meaning | UI requirement |
| --- | --- | --- |
| `document-authoring` | Writes durable `nk*` project facts such as clips, layers, tracks, model project data, Canvas nodes, or stable source refs. | Must work through package authoring service without requiring an open Webview. |
| `interactive-editor` | Depends on focused editor state, selection, viewport, keyboard focus, active stream, Engine runtime state, or live preview session. | May require an active editor, but must fail visibly when the editor/runtime is unavailable. |
| `projection-only` | Displays preview, progress, status, runtime image, waveform, viewport pixels, or diagnostics without changing durable project facts. | Must not claim durable save/import success. |

If a feature has both durable and interactive meanings, split the contracts. For example, importing a generated clip into `.nkv` is `document-authoring`; selecting a clip in the currently focused timeline is `interactive-editor`.

## Canonical Authoring Entry Points

Each migrated package owns a package-local authoring service or typed API:

- Cut: `.nkv` load/create/mutate/save.
- Sketch: `.nks` load/create/mutate/save and durable layer/source insertion.
- Audio: `.nka` `documentUri` load/mutate/save even when the editor cache is cold.
- Model: `.nkm` asset import and durable project fact updates.

Shared code owns only client-neutral contracts: target, result, diagnostics, operation classification, static guard helpers, and test poison helpers. Domain edit planning remains in the owning package.

Canonical command/API names should expose the boundary. Prefer names such as `neko.<domain>.authoring.<operation>` or a typed package API with the same semantics. Old UI-shaped command IDs, such as `neko.cut.importGeneratedClip`, `neko.sketch.importAsset`, and `neko.model.importAsset`, must not be default Agent/Assets durable-write targets.

Old command IDs may only be:

- removed;
- retained as UI-only wrappers that call canonical authoring first;
- retained as fail-closed migration diagnostics.

They must not post Webview mutations and report durable success.

## Migrated Package Paths

| Package | Canonical document-authoring path | Legacy/default-success path |
| --- | --- | --- |
| Canvas | `CanvasProjectAuthoringService`, Canvas authoring tools, `NekoCanvasAPI.importAsset()` and storyboard APIs | Webview-private node mutation as Agent/Assets executor is not allowed. |
| Cut | `CutProjectAuthoringService`; `neko.cut.authoring.importGeneratedClip`, `neko.cut.authoring.addSourceToTimeline`, `neko.cut.authoring.importStoryboard`, `neko.cut.authoring.importCanvasDraft` | `neko.cut.importGeneratedClip`, Webview `importGeneratedClip` / storyboard import messages, and hidden timeline-editor prerequisites are removed from production authoring. |
| Sketch | `SketchProjectAuthoringService`; `neko.sketch.authoring.importImageSource` | `neko.sketch.importAsset`, queued file import, and `.neko/temp` sketch projects are removed from production authoring. |
| Audio | `AudioProjectSessionGateway.resolveSession(documentUri)`, `linkAudioSource`, and `applyOperation` | Agent/project edits must not require an already-open `_projectDataCache` entry or Webview `agent:*` postMessage. |
| Model | `ModelProjectAuthoringService`; `neko.model.authoring.importAsset` | `neko.model.importAsset`, queued model import, and temp-project/open-editor import prerequisites are removed from production authoring. |

VS Code custom editor save/save-as may still request a Webview snapshot when the user is actively editing that Webview. That is an interactive editor lifecycle save, not a host-originated Agent/Assets/TUI/Electron durable authoring executor.

## Target And Reveal Policy

Durable authoring target resolution is explicit:

1. `target.documentUri` writes that project file.
2. `target.kind: "active"` may use a safe active document for the same package.
3. `target.kind: "new"` may create a project file only when the operation allows create-new.
4. Missing or ambiguous targets return diagnostics.

Opening or focusing an editor is a post-write adapter action controlled by `reveal`. A successful write with `reveal: false` keeps closed editors closed. `reveal: true` may open/focus the editor after the project facts are saved; reveal failure is separate from write failure.

## Client Adapters

VSCode, TUI, Electron, Agent, Assets, and package APIs all adapt to the same package authoring services.

- VSCode adapters own command registration, `vscode.Uri` conversion, custom editor reveal, and open-Webview synchronization.
- TUI adapters own text diagnostics and filesystem/workspace target selection, without Webview assumptions.
- Electron adapters own native window reveal and desktop file picker integration.
- Agent adapters own capability schema, skill guidance, lifecycle approval, and diagnostic projection.

The authoring core must not import VSCode window APIs, Webview panels, React, DOM, terminal UI components, or Electron window state.

Client adapters may choose different presentation behavior, but they must pass the same structured `target`, `source`, `reveal`, and `provenance` semantics. TUI cannot reimplement package JSON mutation because it lacks the package source policy and codec rules; Electron cannot use native window reveal as proof of a write; VS Code commands cannot open a hidden editor to make the mutation possible. All three must report package diagnostics when authoring is unavailable.

## Source Identity

Source-bearing authoring requests must use shared content access, the owning generated-output or Asset identity, and project-file source policy before save.

Durable facts may store stable refs, `ContentFileSourceRef`, `ContentDocumentSourceRef`, `ResourceRef`, asset/entity IDs, workspace-relative paths, `${VAR}/path`, or project-owned JSON. They must not persist Webview URIs, blob URLs, cache paths, temp paths, Engine tokens, stream IDs, range URLs, preview URLs, or unpromoted generated cache artifacts.

For Canvas Board delivery, Markdown, durable file references, and creator-visible generated outputs may author as ordinary persistent nodes. Generated binary media must first be committed under `neko/generated/<kind>/` with stable lifecycle/`ResourceRef`; Asset promotion is optional and creates a distinct identity. With no explicit target the Canvas projector writes only `neko/boards/workspace.nkc`; explicit targets name an ordinary `.nkc`. Active/recent documents, conversation binding, runtime Group IDs, cache paths, and Webview projections must be rejected by the durable authoring path.

## Validation

Acceptance must prove the path, not only the outcome:

- no active Webview needed for document-authoring;
- save/reopen recovers project facts;
- old UI-bound routes are removed, poisoned, or asserted unused;
- core services have no UI dependency imports;
- open editors synchronize after host writes;
- runtime-only commands fail visibly without required editor/runtime state.
