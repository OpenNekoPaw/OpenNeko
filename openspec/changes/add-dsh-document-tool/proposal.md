# Proposal: Add the canonical DSH document tool

OpenNeko currently describes document access through the pre-DSH `ReadDocument` and `ReadImage` names. Those names are not registered in the active DSH profile, while DSH already owns `read` and `read_image` for text and standalone raster files. This leaves archive and office document access without one model-facing contract and makes prompts advertise a runtime path that cannot execute.

The change adds one OpenNeko-owned DSH domain tool, `openneko.document`, with explicit `read`, `continue`, and `read-images` operations. It keeps DSH native `read` and `read_image` unchanged and removes the old Pi-facing names from the active model contract.

## Scope

- Add a package-owned document DSH schema, decoder, and projection contract.
- Route the tool through the existing DSH ACP Host path and workspace authorization.
- Register the official OpenNeko DSH plugin in the Desktop profile and runtime closure.
- Update prompt/tool inventory and focused contract, Host, plugin, and profile tests.

## Non-goals

- Reimplement DSH filesystem `read` or `read_image`.
- Add a compatibility alias for `ReadDocument` or `ReadImage`.
- Introduce a second document parser or a new persistence owner.
- Claim real provider or native image-model acceptance without a configured image-capable route.
