# Validation evidence

## 2026-08-22 scene recovery follow-up

- The context bar remains associated with its exact Conversation and Workspace. Before the first Conversation exists,
  the selection belongs to the mounted Agent Surface draft and transfers only when that draft publishes the new
  Conversation. It is not a durable Conversation binding or Workspace fact and can be discarded on a full application
  restart.
- Agent Webview tests passed (`4` files, `47` tests) and Desktop full tests passed (`104` files, `631` tests). Coverage
  proves selection restoration after the Agent child root unmounts and remounts under a stable Renderer provider, exact
  draft-to-Conversation transfer, sibling Conversation/Workspace isolation, and use of the restored exact Canvas on the
  next submission. Both package typechecks, focused ESLint, strict OpenSpec and Webview/application/package boundaries
  passed. The active Forge development owner rebuilt Main and restarted Electron; production packaging was not run in
  parallel with that single bundle writer.
- No CSS, layout, labels or existing OpenNeko Webview presentation were changed. Visible Electron acceptance remains a
  manual requirement because component tests do not prove the authoritative scene-switch path in the running Desktop.
