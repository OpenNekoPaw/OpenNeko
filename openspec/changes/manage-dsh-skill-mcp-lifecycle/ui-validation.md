## Acceptance inventory

- Extensions contains exactly Skill, MCP and Professional Applications tabs.
- Skill and MCP each expose one tab-specific add action.
- Personal Skills expose enabled/disabled state and source-aware enable/delete actions; bundled and
  project Skills remain read-only.
- MCP exposes transport/readiness state and enable/delete actions with local diagnostics.
- Destructive actions require confirmation and describe their exact data impact.
- The search field yields space to the add action; action labels remain on one line and move as a
  whole only when the management container becomes compact.
- Skill and MCP cards use the same 214 by 120 pixel healthy-state metrics as Professional
  Applications; the heading, two-line summary and 20-pixel status pill form one vertically centered
  content block with symmetric horizontal padding and equal top/bottom visual insets. Disabled
  cards remain readable with local muted treatment.

## Evidence

- Agent Webview tests: 6 files / 63 tests passed, including Skill import intent, personal Skill
  disable and canonical MCP add form.
- Desktop extension composition and sender-bound Host tests passed.
- A focused visible Desktop scenario was added as
  `scripts/desktop-functional/extension-management-lifecycle.mjs`. It checks all three tabs and the
  MCP/Professional Application add dialogs without starting an executable or network endpoint. It
  also rejects toolbar overflow, collapsed search width, wrapped action labels and cross-tab card
  metric drift.

## Authoritative runtime result

Targeted presentation pass. The running visible Development Electron window hot-reloaded the final
styles, and direct image-capable review confirmed that Add Skill remains horizontal, the search
field consumes the remaining toolbar width and the toolbar has no visible overflow. The healthy
Skill cards use the compact fixed-height layout, preserve two-line summaries, and align their
status pills without clipping across the five-column grid. After correcting the internal density,
direct review confirmed that the title, two-line summary and status pill form a centered content
block with matching top/bottom and left/right insets. Switching to Professional Applications
confirmed the same visible card footprint and information hierarchy, then the window was restored
to Skill.

The isolated lifecycle scenario remains blocked because this checkout already has that user-owned
Electron/Vite process running. The process was not terminated, and lifecycle behavior is not
claimed from the presentation inspection. No disabled Skill was available in the current data, so
the disabled visual treatment is covered by the component/state tests rather than claimed from the
visible runtime pass.
