## Scope

Agent Settings Provider-scoped configuration is applicable UI work. The inventory covers the compact initial state, Provider catalog, configured Provider editor, advanced connection disclosure, Provider-owned dialogue/generation models, custom Provider form, model-add entry, scrolling and adjacent Settings overlay layout.

## Runtime

The authoritative runtime was the running OpenNeko Electron development application at `localhost:5173`, using the real Settings overlay and current canonical Provider/model projection. Component tests supplement interaction evidence without replacing Electron presentation evidence.

## Inventory

- Initial: open Settings → Agent; the compact Provider summary is visible, the canonical configuration action sits beside the Agent heading, and no separate advanced-settings content row is rendered.
- Catalog: expand Provider management; configured Providers remain compact, full-width rows with credential status.
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

## Visual findings

- One Provider management entry replaces the earlier Provider/model parallel hierarchy.
- Full-width Provider rows and the neutral editor surface match the reference hierarchy without reproducing unsupported fetch/delete actions.
- Existing Provider connection fields are subordinate to credential and model management through an explicit disclosure.
- Custom Provider fields use a single reading column; protocol remains compact while endpoint and credential fields use available width.
- Model cards stay compact in two columns and collapse to one column under the existing settings container query.
- No clipping, overlap, unreadable labels or overlay-boundary regression was observed in the inspected light-theme 1220×768 states.
- A current Electron screenshot directly confirms the Agent heading, description, right-aligned configuration action and compact Provider summary share one coherent initial viewport with no duplicate advanced-settings block.

## Result

`blocked`: the current Agent initial state passed direct Electron inspection, and component tests cover the complete structural change. Concurrent development-runtime reloads repeatedly closed the Settings overlay before a current configured-Provider screenshot could be captured, so the new side-by-side model-group pixels and narrow-container return state remain blocked. Real credential entry/provider creation was intentionally not performed, and dark theme was not exercised.

## Residual risk

The current title action is visually accepted. Side-by-side dialogue/generation pixels are supported by the mixed Provider component fixture and responsive CSS inspection but lack stable Electron evidence because the shared dev runtime reloaded into unrelated scenes. Credential submission, canonical Provider creation, dark-theme contrast and narrow-window pixels remain unexecuted. No secret was entered or projected during validation.
