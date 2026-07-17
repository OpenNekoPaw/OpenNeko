---
name: vscode-extension-debugger
description: |
  This skill enables debugging VS Code extensions and their webviews through Chrome DevTools Protocol (CDP).
  It should be used when:
  - Debugging VS Code extension webviews (custom editors, panels, sidebars)
  - Inspecting DOM structure of extension webviews
  - Taking screenshots of VS Code windows or webviews
  - Executing JavaScript in extension webviews
  - Monitoring console output from extensions
  Triggers on: "debug extension", "inspect webview", "extension screenshot", "webview DOM", "VS Code debugging"
---

# VS Code Extension Debugger

This skill provides tools to debug VS Code extensions and their webviews using Chrome DevTools Protocol (CDP).

## Prerequisites

1. VS Code must be running with remote debugging enabled on port 9222
2. Launch VS Code with: `code --inspect=9222` or configure in launch.json
3. Node.js must be available with the `ws` package installed globally or in the project

## Core Tool

The CDP client script at `scripts/cdp-client.js` provides all debugging capabilities.

### Available Commands

| Command | Description | Usage |
|---------|-------------|-------|
| `list` | List all debug targets | `node cdp-client.js list` |
| `snapshot` | Get DOM snapshot | `node cdp-client.js snapshot <targetId>` |
| `screenshot` | Capture screenshot | `node cdp-client.js screenshot <targetId> [outputPath]` |
| `eval` | Execute JavaScript | `node cdp-client.js eval <targetId> <code>` |
| `console` | Get console messages | `node cdp-client.js console <targetId>` |

## Workflow

### Step 1: List Available Targets

To find debug targets:

```bash
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js list
```

Output shows all available targets:
- `type: "page"` - VS Code windows (use for screenshots)
- `type: "iframe"` - Extension webviews (use for DOM inspection)
- `type: "worker"` - Background workers

### Step 2: Identify Target

From the list output, identify the relevant target:
- For webview debugging: Find the iframe with `extensionId` matching your extension
- For screenshots: Use the main page (type: "page") without parentId

### Step 3: Inspect or Debug

**Get DOM Snapshot:**
```bash
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js snapshot <targetId>
```

Returns:
- `title` - Page/webview title
- `bodyText` - Text content (first 5000 chars)
- `elements` - Interactive elements (buttons, inputs, etc.)

**Take Screenshot:**
```bash
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js screenshot <targetId> /tmp/screenshot.png
```

Note: Screenshots only work on top-level pages, not iframes. To capture webview content, screenshot the parent VS Code window.

**Execute JavaScript:**
```bash
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js eval <targetId> "document.title"
```

For webview iframe content:
```bash
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js eval <parentPageId> "document.getElementById('active-frame').contentDocument.body.innerText"
```

**Monitor Console:**
```bash
node .codex/skills/vscode-extension-debugger/scripts/cdp-client.js console <targetId>
```

## Limitations

1. **Screenshots**: Only work on top-level pages (type: "page"), not iframes
2. **Cross-origin**: Some webview content may be cross-origin restricted
3. **Port**: Default port is 9222, ensure VS Code is launched with this debug port

## Troubleshooting

### "Connection refused"
- Ensure VS Code is running with `--inspect=9222`
- Check if port 9222 is in use: `lsof -i :9222`

### "Target not found"
- Run `list` command to refresh available targets
- Webview targets appear only when the webview is visible

### "Command can only be executed on top-level targets"
- This error occurs when trying to screenshot an iframe
- Use the parent page ID instead for screenshots

## Debug Session Control

Control VS Code debug sessions using AppleScript keyboard shortcuts.

### Available Commands

| Action | Shortcut | AppleScript Command |
|--------|----------|---------------------|
| Start Debugging | F5 | `key code 96` |
| Stop Debugging | Shift+F5 | `key code 96 using {shift down}` |
| Restart Debugging | Cmd+Shift+F5 | `key code 96 using {command down, shift down}` |
| Step Over | F10 | `key code 109` |
| Step Into | F11 | `key code 103` |
| Step Out | Shift+F11 | `key code 103 using {shift down}` |

### Usage Examples

**Start Debugging:**
```bash
osascript <<EOF
tell application "Visual Studio Code" to activate
delay 0.3
tell application "System Events"
    tell process "Code"
        key code 96
    end tell
end tell
EOF
```

**Stop Debugging:**
```bash
osascript <<EOF
tell application "Visual Studio Code" to activate
delay 0.3
tell application "System Events"
    tell process "Code"
        key code 96 using {shift down}
    end tell
end tell
EOF
```

**Restart Debugging:**
```bash
osascript <<EOF
tell application "Visual Studio Code" to activate
delay 0.3
tell application "System Events"
    tell process "Code"
        key code 96 using {command down, shift down}
    end tell
end tell
EOF
```

### Prerequisites for AppleScript

System Preferences > Security & Privacy > Privacy > Accessibility must include:
- Terminal (or your terminal app)
- osascript

### VS Code Debug Commands Reference

These commands can be executed via `vscode.commands.executeCommand()` in extension code:

| Command | Description |
|---------|-------------|
| `workbench.action.debug.start` | Start debugging (F5) |
| `workbench.action.debug.stop` | Stop debugging (Shift+F5) |
| `workbench.action.debug.restart` | Restart debugging (Cmd+Shift+F5) |
| `workbench.action.debug.selectandstart` | Select and start debug config |
| `workbench.action.debug.continue` | Continue execution |
| `workbench.action.debug.stepOver` | Step over (F10) |
| `workbench.action.debug.stepInto` | Step into (F11) |
| `workbench.action.debug.stepOut` | Step out (Shift+F11) |

Note: `vscode.debug.activeDebugSession` is an API property, not a command.

## Example Session

```bash
# 1. List targets
node cdp-client.js list
# Output: [{"id":"ABC123","type":"page","title":"[Extension Host] ..."},...]

# 2. Get webview snapshot (find iframe with your extension)
node cdp-client.js snapshot DEF456

# 3. Screenshot the main window
node cdp-client.js screenshot ABC123 /tmp/vscode.png

# 4. Execute code in webview
node cdp-client.js eval DEF456 "document.querySelectorAll('button').length"

# 5. Control debug session
osascript -e 'tell application "Visual Studio Code" to activate' && \
osascript -e 'tell application "System Events" to tell process "Code" to key code 96'
```
