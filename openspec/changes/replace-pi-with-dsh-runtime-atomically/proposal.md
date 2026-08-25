## Why

Maintaining Pi and DSH execution authorities in parallel duplicates Agent lifecycle, Tool, Skill, MCP, queue, transcript, and storage behavior and expands Electron Main's trust boundary.

## What Changes

- Make an isolated DSH subprocess the single Agent execution authority and ACP the single production communication boundary.
- Keep OpenNeko product Conversation identity, permissions, domain bindings, durable projections, and Host trust in their owning application services.
- Remove Pi and all parallel Agent runtime, registration, contract, storage, and product success paths while preserving protected user records.

## Capabilities

### New Capabilities

- `dsh-agent-runtime-authority`
- `dsh-extension-runtime-boundary`
- `atomic-agent-runtime-cutover`

### Modified Capabilities

- `agent-storage-authority`
- `local-storage-authority-policy`

## Impact

This is a system-wide Agent runtime replacement across Desktop, Agent, domains, Settings, and Extensions. The product keeps one canonical path and does not preserve Pi compatibility.
