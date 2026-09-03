## Why

Workspace Agent requests for complete, reusable creative documents must produce durable files rather than leave the full document only in Conversation text. Once DSH is the sole writer, the current Canvas still needs a trustworthy reference to the file without reintroducing a Host writer or a second artifact identity.

## What Changes

- Classify named, reusable and substantially complete Workspace results as durable portable text documents even when the user does not literally request a file save.
- Require DSH native filesystem Tools to create or revise the document and make Tool success the only persistence evidence.
- Project the exact successfully written Workspace file locator to the admitted Canvas as a reference node; the projection never carries or rewrites document bytes.
- Return a concise Agent summary, the durable document reference and at most one state-grounded recommended operation without duplicating the document body.
- Fail visibly when writing or Canvas reference projection cannot be completed; never fall back to terminal markers, Host publication or Conversation-only document output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dsh-text-file-authoring`: Add durable-document intent classification, exact successful-write Canvas reference projection, and summary/document/recommendation terminal behavior.

## Impact

The Agent application remains the owner of Conversation binding and completed Tool projection, DSH remains the sole text-file writer and Tool lifecycle authority, the Content domain remains the owner of Workspace file locators, and Canvas remains the owner of reference-node persistence. Desktop Main only wires the authorized locator projection to the exact admitted Canvas; Renderer contracts do not gain raw paths or document bytes.
