## Product boundary

Professional Application management owns installed-application identity, readiness, launch, document handoff, and qualified automation capabilities. Resource owners authorize source content and own returned artifacts. ComfyUI remains an external application and does not become an OpenNeko domain authority.

## Core invariants

- Discovery does not grant launch, file, API, MCP, or Computer Use authority.
- Every handoff binds an exact application, source revision, operation, authorization, and expected outcome.
- Stable API/MCP integration and explicitly selected Computer Use are distinct capabilities; failure never switches transport implicitly.
- External outputs become OpenNeko facts only after verification and explicit ingest by the owning resource service.
- Missing applications, permissions, documents, capabilities, or completion evidence fail visibly and locally.

## Product acceptance

The capability is complete when creators can send supported resources to a qualified ComfyUI installation, observe/cancel supported work, and review verified outputs through the canonical Desktop path.

## Non-goals

This change does not embed ComfyUI, expose arbitrary process control, or provide generic pixel-coordinate automation.
