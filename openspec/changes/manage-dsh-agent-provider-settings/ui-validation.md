## Scope

Agent Settings Provider-scoped configuration is applicable UI work. The inventory covers the compact initial state, Provider catalog, configured Provider editor, advanced connection disclosure, Provider-owned dialogue/generation models, custom Provider form, model-add entry, scrolling and adjacent Settings overlay layout.

## Runtime

The authoritative runtime was the running OpenNeko Electron development application at `localhost:5173`, using the real Settings overlay and current canonical Provider/model projection. Component tests supplement interaction evidence without replacing Electron presentation evidence.

## Inventory

- Initial: open Settings → Agent; only the compact Provider summary and advanced Agent entry are visible.
- Catalog: expand Provider management; configured Providers remain compact, full-width rows with credential status.
- Configured Provider: select a Provider; credential input, collapsed custom settings, Provider-owned model catalog and footer actions appear in one panel.
- Advanced: expand and collapse custom settings; display name, API URL and protocol appear without changing model ownership.
- Models: dialogue and generation entries are grouped within the selected Provider, defaults are marked on cards and other enabled models expose Set as default.
- Custom Provider: open Add Provider; identity, name, endpoint, protocol and credential fields appear in a focused single-column form; model configuration is explicitly unavailable until canonical Provider creation.
- Return/adjacent: cancel returns to the Provider catalog; Settings overlay navigation and independent scrolling remain usable.

## Evidence

- `DesktopSettingsSurface.test.tsx`: proves the initial surface has no parallel model summary or selectors, selecting a Provider reveals only its models, the default action sends the exact type/provider/model identity, and the custom Provider form does not expose a model editor before save.
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

## Result

`blocked`: all listed Electron states except the final post-polish recapture were inspected successfully. macOS locked before the final field-order and duplicate-copy cleanup could be recaptured. Real credential entry/provider creation was intentionally not performed, and dark theme plus a narrower supported window were not exercised.

## Residual risk

The final custom-form field order and disabled save appearance are covered by component/DOM behavior and CSS review but lack a post-polish screenshot. Credential submission, canonical Provider creation, dark-theme contrast and narrow-window pixels remain unexecuted. No secret was entered or projected during validation.
