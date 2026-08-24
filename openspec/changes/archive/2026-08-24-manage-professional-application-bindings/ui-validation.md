## Acceptance inventory

- Professional Applications exposes All and Added views plus one Add Application action.
- Added bindings show enabled/disabled state.
- Detail view can enable/disable and request removal.
- Removal requires confirmation and explicitly states that the external application is not
  uninstalled or modified.
- All/Added and Add Application remain whole, single-line controls while the search field consumes
  the remaining toolbar width.
- Professional Application cards define the 214 by 120 pixel healthy-state baseline shared with
  Skill and MCP cards. Their heading, two-line summary and 20-pixel status pill form one vertically
  centered content block with symmetric horizontal padding and equal top/bottom visual insets.

## Evidence

- Professional Applications Webview: 5 tests passed, including the complete add, disable and
  confirmed-remove interaction.
- Desktop composition tests verify the Professional Applications tab remains part of the single
  Extensions scene.
- The focused visible Desktop scenario is shared with DSH lifecycle validation and rejects toolbar
  overflow, wrapped controls or cross-tab card metric drift.

## Authoritative runtime result

Targeted presentation pass in the running visible Development Electron window. Direct
image-capable review confirmed that All, Added and Add Application remain complete horizontal
controls on the same row and that the search field takes the remaining width without visible
overflow. The enabled ComfyUI card uses the same compact footprint, two-line summary budget and
centered status-bearing content block as the Skill cards; the window was returned to Skill after
the comparison.

The isolated lifecycle scenario remains blocked by the existing user-owned Electron/Vite process;
the process was not terminated, and no lifecycle pass is inferred from this presentation check. No
disabled application was available in the current data, so its muted visual state is verified by
component/state tests rather than claimed from the visible runtime pass.
