## Context

DSH now owns portable Workspace text reads and writes, while OpenNeko no longer parses terminal response markers or writes assistant response bytes. The completed DSH Tool stream already reaches the Agent application, and Canvas already accepts authorized `ContentLocator` reference projections with durable delivery receipts. The missing boundary is a projection from one exact successful DSH text write to one exact Canvas reference node.

## Goals / Non-Goals

**Goals:**

- Preserve DSH as the sole document-byte writer and success authority.
- Create a Canvas reference node only from an exact successful native text write in the same Workspace-bound turn.
- Keep the final response concise and separate the Agent summary, durable document reference and recommended operation.
- Preserve conflict protection, Workspace containment, exact Canvas targeting and idempotent projection.

**Non-Goals:**

- Reintroduce terminal markers, response-body parsing or a Host file writer.
- Copy document bytes into Canvas or make Canvas a second document authority.
- Project ordinary answers, failed writes, reads, edits without a resulting durable locator, protected project formats or non-text outputs through this path.

## Decisions

### Successful DSH write is the only projection trigger

The Agent application derives a candidate only from a completed native `write` Tool event. Its model-controlled path must be a normalized Workspace-relative portable text path. Desktop then resolves the exact Conversation Workspace and verifies the locator through the Content owner before Canvas mutation. A final assistant message is never parsed for identity or content.

This is preferred over a locator embedded in terminal text because the Tool event proves the side effect and retains exact turn and call identity. It is preferred over a Host callback writer because document bytes and overwrite semantics remain entirely within DSH.

### Canvas stores a reference, not document content

The projected artifact has output role and a Workspace `ContentLocator`. Canvas owns node placement and durable delivery receipts; Content owns locator validation and fingerprinting; the file remains authoritative in the Workspace. Replayed or duplicate completed Tool events resolve to the same delivery identity and do not create duplicate nodes.

### Document intent remains prompt-level, correctness remains Tool-level

Workspace context classifies named, reusable and substantially complete creator-reviewable outputs as durable documents, including ordinary wording that does not literally say “save”. The prompt requires a concise summary after successful write and prohibits returning the full body as a persistence fallback. Actual persistence and projection require Tool and Content/Canvas evidence; prompt text cannot manufacture success.

### Failure remains local and visible

A failed or missing write creates no reference node. Invalid, absolute, escaping, protected or unverified paths are rejected in their owning boundary. A Canvas projection failure does not roll back or rewrite an already-created file; it reports a visible diagnostic for the affected delivery while the durable document remains available in the Workspace.

## Risks / Trade-offs

- [Model may still omit `write`] → Keep one positive natural-language Agent Evaluation case, one ordinary-answer negative case and real-provider Desktop acceptance.
- [The file is written but Canvas projection fails] → Preserve the file, report a delivery diagnostic and allow the idempotent Canvas delivery coordinator to retain its existing recovery semantics.
- [Model-selected filenames may conflict] → DSH observation and write policies remain authoritative; the Agent must not silently overwrite or rename an existing target.
- [A raw Tool path could be mistaken for a portable locator] → Admit only normalized Workspace-relative text paths, then require Content owner stat/fingerprint before Canvas mutation.
