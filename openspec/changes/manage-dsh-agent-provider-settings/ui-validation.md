## Scope

Agent Settings Provider-scoped configuration is applicable UI work. The inventory covers the direct grouped Provider catalog, configured Provider editor, advanced connection disclosure, Provider-owned dialogue/generation models, custom Provider form, model-add entry, scrolling and adjacent Settings overlay layout.

## Runtime

The authoritative runtime was the running OpenNeko Electron development application at `localhost:5174`, using the real Settings overlay and current canonical Provider/model projection. Component tests supplement interaction evidence without replacing Electron presentation evidence.

## Inventory

- Initial: open Settings → Agent; the grouped Provider catalog and add action are directly visible, the canonical configuration action sits beside the Agent heading, and no Provider summary/accordion or separate advanced-settings content row is rendered.
- Catalog: configured Providers remain compact rows with credential status inside their exact capability group.
- Provider capability groups: dialogue and generation Providers use side-by-side groups at desktop width; mixed Providers appear once; model-less Providers remain visible as unconfigured; narrow containers return all groups to one column.
- Configured Provider: select a Provider; credential input, collapsed custom settings, Provider-owned model catalog and footer actions appear in one panel.
- Advanced: expand and collapse custom settings; display name, API URL and protocol appear without changing model ownership.
- Models: dialogue and generation entries are grouped side by side within the selected Provider when space permits, defaults are marked on cards and other enabled models expose Set as default; narrow containers return the groups to one column.
- Custom Provider: open Add Provider; identity, name, endpoint, protocol and credential fields appear in a focused single-column form; model configuration is explicitly unavailable until canonical Provider creation.
- Return/adjacent: cancel returns to the Provider catalog; Settings overlay navigation and independent scrolling remain usable.

## Evidence

- `DesktopSettingsSurface.test.tsx`: proves the initial surface has no parallel model summary or selectors, selecting a Provider reveals only its models, the default action sends the exact type/provider/model identity, and the custom Provider form does not expose a model editor before save.
- The focused test also proves the configuration action belongs to the Agent group heading, the removed advanced-settings label is absent, and the mixed Provider fixture renders exactly two model groups.
- Electron configured Provider state was directly inspected at 1220×768 after selecting DeepSeek Chat: credential status, collapsed disclosure, two dialogue cards and footer actions were visible.
- Electron configured Provider footer was directly inspected after scrolling: the model catalog, Set as default actions, Cancel/Save footer and adjacent advanced Agent entry did not overlap or clip.
- Electron custom Provider state was directly inspected at the top and after scrolling to its footer: all required fields, compact protocol control, empty model state and disabled incomplete save flow remained contained in the overlay.
- Current Electron Provider catalog was directly inspected after the capability-group follow-up: DeepSeek Chat and Neko API Chat rendered in the left dialogue group, Neko API Media rendered in the right generation group, and model-less Olloma Chat remained visible in the full-width unconfigured group. Counts were 2, 1 and 1 respectively.
- The flattened-catalog follow-up was directly inspected in the current Electron runtime: the Agent heading is followed immediately by Add Provider and the dialogue/generation/unconfigured groups; no outer Provider title, count, summary card or disclosure control exists. Selecting DeepSeek Chat then exposed the scoped Provider editor, proving editing remains on demand.
- The focused component fixture proves dialogue-only, generation-only, mixed and unconfigured Providers enter their exact groups and that the mixed Provider appears once. The renderer style test proves the two-column rule and its 620px single-column container override.

## Visual findings

- Direct capability groups replace the earlier Provider/model parallel hierarchy and the redundant outer Provider management wrapper.
- Full-width Provider rows and the neutral editor surface match the reference hierarchy without reproducing unsupported fetch/delete actions.
- Existing Provider connection fields are subordinate to credential and model management through an explicit disclosure.
- Custom Provider fields use a single reading column; protocol remains compact while endpoint and credential fields use available width.
- Model cards stay compact in two columns and collapse to one column under the existing settings container query.
- No clipping, overlap, unreadable labels or overlay-boundary regression was observed in the inspected light-theme 1220×768 states.
- A current Electron screenshot directly confirms the Agent heading, description, right-aligned configuration action and direct Provider groups share one coherent initial viewport with no duplicate Provider or advanced-settings block.
- A current Electron screenshot directly confirms the Provider-level two-column hierarchy, aligned group headings/counts, compact cards, readable credential badges and full-width unconfigured section without clipping or overlap.

## Result

`passed` for the flattened Provider hierarchy: the current Agent initial state and wide Provider capability grouping passed direct Electron inspection, and selecting a Provider proved the editor remains on demand. Component/style tests cover the complete grouping and responsive structure. Real credential entry/provider creation was intentionally not performed, and dark theme was not exercised.

## Residual risk

The direct catalog, title action and wide Provider grouping are visually accepted. Provider and model single-column responsive behavior remains covered structurally but lacks stable Electron pixels because the shared dev runtime was replaced during an earlier resize. Credential submission, canonical Provider creation, dark-theme contrast and narrow-window pixels remain unexecuted. No secret was entered or projected during validation.

## Local Provider and deletion follow-up

- **Scope:** local/remote source copy, Ollama dialogue-only configuration, model deletion and Provider
  deletion confirmation are applicable UI changes.
- **Runtime:** the required authoritative boundary is the isolated Electron Desktop because both deletion
  actions cross Renderer/preload/Main and mutate canonical ConfigManager state.
- **Inventory:** the added `desktop-ai-model-settings` scenario opens Settings through the normal footer,
  enters Agent settings, checks direct dialogue/generation groups, opens local Ollama, verifies no secret
  input and only `llm`, then deletes a non-default model and its now-empty custom Provider through separate
  confirmation cycles. It captures catalog, local editor and confirmation pixels.
- **Functional evidence:** focused Renderer tests pass the same state transitions with the typed bridge;
  Host service and DSH projection tests pass the exact cross-boundary semantics.
- **Visual evidence:** no new stable artifact was produced because the isolated development Desktop could
  not start while process `74442` owned this checkout's Vite bundle. The launcher timed out waiting for CDP
  after that child startup was rejected. No pixel claim is inferred from unit tests or the failed report.
- **Result:** `blocked` for the new Electron functional/visual inventory. The prior flattened catalog remains
  accepted; this advisory block does not turn deterministic contract/service results into a failure.
- **Residual risk:** current-runtime pixels for local badges, compact delete confirmation and post-delete
  catalog reflow remain uninspected. Re-run
  `node scripts/run-desktop-ui-functional.mjs --scenario desktop-ai-model-settings` after the existing
  development process exits.

## Canonical config ownership correction

- **Scope:** deletion visibility changed for config-backed Providers carrying preset metadata; no layout or token
  change was introduced.
- **Inventory:** the isolated scenario now requires the local Ollama fixture with `builtin = true` to expose the
  same delete action, retains dialogue-only and no-secret checks, deletes an empty Provider, and verifies the exact
  fixture TOML records are gone.
- **Functional evidence:** Renderer tests pass the visible action and confirmation states; Host tests pass
  owned-model protection and real temporary TOML edit/delete persistence.
- **Result:** `blocked` for fresh Electron pixels because process `95583` owned the checkout's development bundle
  before the scenario could launch. The existing process was not interrupted, and no visual acceptance is inferred
  from deterministic tests.
