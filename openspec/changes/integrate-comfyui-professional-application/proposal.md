## Why

Professional Application binding and readiness are already canonical, but OpenNeko still lacks one safe end-to-end path for handing an exact authorized resource to ComfyUI, executing a qualified workflow, and ingesting only verified outputs.

## What Changes

- Add semantic resource actions and exact authorized handoff to an enabled ComfyUI binding.
- Add explicit ComfyUI API workflow execution and separately qualified Computer Use operations without transport fallback.
- Correlate progress, cancellation and output retrieval with one Generation Job, and ingest only verified outputs through their owning resource services.

## Capabilities

### New Capabilities

- `professional-resource-handoff`
- `comfyui-professional-workflow`

### Modified Capabilities

<!-- None. -->

## Impact

The existing Professional Application binding lifecycle supplies exact enablement and readiness. Host owns application/process/file trust, resource owners authorize inputs and ingest outputs, Generation owns Job lifecycle, and ComfyUI remains an external application. No generic executable or fallback automation authority is added.
