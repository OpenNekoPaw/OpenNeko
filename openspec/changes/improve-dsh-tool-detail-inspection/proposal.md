# Proposal: Make DSH Tool details inspectable

The Agent Webview receives complete DSH Tool input/output JSON, but its current
detail card clips vertical overflow and provides no explicit copy action. This
prevents users from inspecting diagnostics even though the runtime payload is
available.

## Scope

- Preserve the existing OpenNeko Agent Webview layout and tool card.
- Add input/output copy actions and visible success/failure feedback.
- Make long payloads vertically scrollable and explicitly expandable.

## Non-goals

- Do not adopt DSH UI components or replace the current Agent surface.
- Do not change Tool execution, persistence, or ACP payload contracts.

## Impact

`@neko/agent-webview` remains the presentation owner. No Desktop or domain
business logic is added.
