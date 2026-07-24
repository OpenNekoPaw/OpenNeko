---
name: vscode-extension-debugger
description: |
  Validate VS Code extensions through two explicit lanes: use Computer Use for
  no-port, black-box host UI workflows, and use Chrome DevTools Protocol (CDP)
  for Webview iframe, DOM, JavaScript, console, and runtime diagnostics. Use
  this skill when debugging an Extension Development Host, validating a VS
  Code command or visible workflow, inspecting an extension Webview, or
  collecting VS Code runtime evidence.
---

# VS Code Extension Debugger

Classify the requested evidence before starting. This skill has two complementary
lanes; do not present one lane as evidence for the other.

| Lane                | Use for                                                                                                                                                        | Debug port                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Host UI / black box | Launching the Extension Development Host, native VS Code commands, menus, focus, keyboard input, visible text, and whole-window screenshots                    | Not required              |
| Webview / white box | Webview target discovery, iframe/DOM inspection, JavaScript evaluation, console diagnostics, CSP/resource investigation, and Webview-specific runtime evidence | Required (default `9222`) |

## Host UI Lane (No CDP Port)

Use the `computer-use` skill for direct VS Code UI actions. It operates through
macOS Accessibility and does not require VS Code to expose a remote debugging
port.

1. Use an isolated Extension Development Host and the repository's synthetic
   `neko-test` workspace. Do not capture the user's normal workspace, settings,
   credentials, or unrelated files.
2. Select the repository launch configuration `Debug Dev (All)` and start the
   debug session through the visible VS Code UI. The configuration owns the
   extension development paths and its `build:dev` prelaunch task.
3. Drive the user-visible workflow with clicks, keyboard input, menus, and
   focus changes. Re-read the current accessibility state after each UI action;
   element positions and indices are not stable across updates.
4. Assert only observable host results: visible labels, enabled/disabled state,
   selected views, focus, dialogs, and user-visible side effects.

This lane may validate a rendered Webview as a user would see it, but it cannot
prove the Webview's DOM, iframe identity, postMessage path, CSP, resource URI,
console, or network behavior. Do not use a successful UI observation to claim
Webview white-box acceptance.

## Webview Lane (CDP Required)

Use this lane whenever the scenario mentions Webview DOM, iframe targets,
`postMessage`, CSP, `asWebviewUri`, resource/media failures, console output, or
path-level Webview diagnostics.

### Prerequisites

1. Run VS Code with remote debugging enabled on port `9222`, or set a different
   port through the command options/environment described below.
2. Ensure Node.js and the `ws` package are available to the repository script.
3. Make the target Webview visible. VS Code does not expose an iframe target
   until the Webview is mounted and visible.

### Target Preflight

Run the repository target smoke and require the skill explicitly:

```bash
pnpm smoke:vscode:targets -- --skill vscode-extension-debugger
```

For a Webview scenario, require an iframe target:

```bash
pnpm smoke:webview:targets
```

The target smoke proves only that the CDP page/iframe is discoverable. It is
not functional Webview acceptance.

### CDP Client Commands

The bundled client is `.codex/skills/vscode-extension-debugger/scripts/cdp-client.js`.

```bash
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js list
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js snapshot <targetId>
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js screenshot <pageTargetId> /tmp/vscode.png
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js eval <targetId> "document.title"
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js console <targetId>
```

Use `list` first and select targets by identity, not by a stale index:

- `type: "page"`: top-level VS Code Workbench; use it for screenshots.
- `type: "iframe"` or a `vscode-webview://` URL: extension Webview; use it
  for DOM snapshots and JavaScript evaluation.
- `type: "worker"`: background worker; use only when the scenario requires it.

Screenshots are supported only for top-level page targets. To capture a
Webview's rendered pixels, capture its parent VS Code page. For Webview DOM
inspection, evaluate against the Webview target or the parent frame's active
frame when the target is exposed there.

### Port and Target Options

The repository smoke accepts:

```text
--port <port>
--timeout-ms <milliseconds>
--skill <name-or-path>
--require-webview
--expect-title <text>
--expect-url <text>
--expect-extension-id <id>
```

The default port is `9222`. `NEKO_VSCODE_DEBUG_PORT`,
`NEKO_VSCODE_DEBUGGER_SMOKE_TIMEOUT_MS`,
`NEKO_VSCODE_DEBUGGER_SMOKE_SKILLS`, and
`NEKO_VSCODE_DEBUGGER_SMOKE_REQUIRE_WEBVIEW` provide equivalent environment
configuration for the repository smoke.

## Evidence Rules

- Use an isolated synthetic workspace for every functional scenario.
- Record the host, extension/configuration identity, target type, command,
  observed result, and failure classification.
- Keep host UI evidence and CDP evidence separately labeled. A no-port
  Computer Use run is black-box evidence; it does not replace a CDP Webview
  run when the changed behavior crosses the Webview boundary.
- Treat VS Code container warnings about `local-network-access` or the
  Webview sandbox as benign only when they originate from VS Code's own
  Webview container. Investigate Neko CSP, media, resource, save, and message
  diagnostics separately.
- Do not use ordinary browser, Vite localhost, Browser, Playwright, or a
  no-port host screenshot as the default acceptance path for Webview CSP,
  message, focus, media, or lifecycle changes.

## Troubleshooting

- `Connection refused`: the CDP lane has no reachable VS Code endpoint. Use the
  Host UI lane if the requested evidence is strictly black-box, otherwise start
  VS Code with remote debugging and retry.
- `no webview iframe targets were visible`: bring the target Webview to the
  foreground in the isolated Extension Development Host, then rerun preflight.
- `Target not found`: refresh `list` and reselect the target by current id.
- `Command can only be executed on top-level targets`: use the parent page for
  screenshots; use the iframe target for DOM/runtime operations.

## Non-Equivalence Boundary

Do not claim that Computer Use replaced the debugger when the acceptance
requires Webview DOM, iframe identity, JavaScript, CSP, console, resource, or
message evidence. Conversely, do not require a CDP port for a host-only UI
scenario whose assertions are limited to visible VS Code behavior.
