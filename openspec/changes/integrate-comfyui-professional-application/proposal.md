## Why

OpenNeko needs one trusted product boundary for professional applications before it can safely hand resources to ComfyUI, automate supported operations, and ingest verified outputs.

## What Changes

- Add professional-application identity, readiness, launch, document handoff, and capability management.
- Add explicit ComfyUI API/MCP workflow support and separately qualified Computer Use operations.
- Return only verified outputs to their owning OpenNeko resource services.

## Capabilities

### New Capabilities

- `professional-application-management`
- `professional-resource-handoff`
- `comfyui-professional-workflow`

### Modified Capabilities

<!-- None. -->

## Impact

Host owns application/process/file trust, resource owners authorize inputs and ingest outputs, and ComfyUI remains an external application. No generic executable or fallback automation authority is added.
