# Design

`ToolPayload` remains a pure Webview projection over the authoritative
`rawInput`/`rawOutput` value. It serializes the value once as formatted JSON,
uses that same full string for display and clipboard writes, and keeps local
expanded/copy-feedback state only.

The collapsed view receives a bounded vertical scroll area. Expand/collapse
changes only presentation height; it does not truncate or rewrite the payload.
Clipboard failure is visible on the affected payload and never reports success.

This is Webview-only presentation behavior and does not require Agent behavior
Evaluation. Component tests cover exact copied text and long-payload expansion;
the existing UI must receive advisory visual validation.
