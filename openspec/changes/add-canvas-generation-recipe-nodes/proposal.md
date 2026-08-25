## Why

Creators need one durable Canvas workflow for configuring and running text, image, audio, and video generation. Separate direct-generation modes and detached Job/result nodes fragment the product workflow and ownership model.

## What Changes

- Add typed Canvas generation nodes whose recipe, execution state, and selected result remain attached to one durable node.
- Route Canvas and Agent-assisted generation through the same Generation authority and exact Workspace context.
- Remove duplicate product entry semantics and keep unsupported or failed generation local and visible.

## Capabilities

### New Capabilities

- `canvas-generation-nodes`

### Modified Capabilities

- `desktop-assets-canvas-integration`
- `generation-domain-package`
- `agent-configuration-policy`

## Impact

Canvas owns authoring and presentation; Generation owns Jobs/providers; Host owns authorization; existing Canvas documents and generated assets remain preserved.
