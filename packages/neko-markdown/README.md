# @neko/markdown

`@neko/markdown` owns Neko's host-neutral Markdown semantic contract. It parses authoritative CommonMark/GFM source into exhaustive Neko-owned nodes, annotations, diagnostics and revision-associated resolution contracts without importing Agent, Canvas, VS Code, React, DOM or content services.

## Canonical entry points

- `parseNormalizedMarkdown(source, options?)`: parse one authoritative source revision into a normalized document or explicit failed result.
- `MarkdownStreamingSession`: append/finalize lifecycle for one Markdown source identity. Streaming updates produce revisions while retaining session identity; finalization finalizes the same session.
- document/node contracts: exhaustive standard CommonMark/GFM nodes plus registered Neko extension nodes.
- annotation contracts: range/node-linked overlapping semantics such as prompt spans and creative-table interpretation.
- resolution contracts: immutable, revision-associated host results for resources, mentions, images, authorization and handoff references.
- diagnostic contracts: stable phase/code/severity/parameters; final localized messages remain host-owned.

Host adapters consume these contracts. They must not expose or depend on remark/MDAST types as the cross-package boundary.

## Source and identity model

The original Markdown string is authoritative. Every source-backed range is a half-open UTF-16 range:

```ts
{ startOffset, endOffset } // [startOffset, endOffset)
```

Source offsets, Unicode code points, grapheme clusters and terminal display columns are distinct units. Hosts may use grapheme/display metrics for layout, but they must not derive source offsets from visual width.

Session, revision, node and annotation identities are opaque/branded. Node and annotation identity is deterministic only within its associated session/revision contract; callers must validate containment, bounds, collisions and association instead of inventing IDs.

## Semantic layers

```text
authoritative Markdown source
  -> normalized document + source-backed/synthetic nodes
  -> overlapping annotations
  -> immutable host resolution snapshot associated with session/revision
  -> host projector / React or terminal presentation adapter
```

Parsing is pure and does not perform workspace, entity, resource, authorization or file IO. Runtime render URIs, blob URLs, cache paths and Webview handles are presentation-only data and never become normalized semantic identity.

## Scope

- Parse CommonMark/GFM-compatible source without rewriting the original Markdown.
- Preserve GFM table alignment, ragged source rows, escaped pipes, links, references, images, raw HTML and normalized fenced-code language identity.
- Project Neko extension syntax and metadata such as creative-table interpretation, `@` mentions, resource-reference tokens, semantic prompt spans, diagnostics and stable handoff refs.
- Preserve unsupported or malformed extension-like syntax as source with diagnostics instead of inventing successful semantics.
- Enforce a deterministic source hard limit and fail without returning a partial successful AST when the contract is exceeded.

## Non-goals

- Validate or mutate Canvas fields, profiles, nodes, connections, prompts or resources.
- Authorize resources or resolve workspace files inside the parser.
- Choose Agent Skills, tools, lifecycle phases or approval decisions.
- Provide React, Ink, DOM, terminal layout, syntax-highlighting or VS Code theme implementations.

## Host adapter boundary

Agent TUI consumes normalized snapshots through a package-local chain:

```text
MarkdownStreamingSession
  -> terminal projector
  -> terminal layout / tables / whole-block highlighting
  -> renderer-owned safe ANSI/OSC encoder
  -> thin Ink <Text> adapter
```

Resize reprojects/reflows the unchanged normalized revision; it does not reparse source. Terminal grapheme width, table modes, code wrapping, theme capabilities and ANSI/OSC encoding remain TUI-local because they are terminal presentation policy.

Agent Webview still has a bounded legacy direct parser and is tracked by the linked OpenSpec change `migrate-agent-webview-to-normalized-markdown`. Until its direct parser removal/runtime gate passes, documentation must not claim all Markdown hosts have converged.

## Diagnostics, resources and security

- Contract violations and invalid associations fail visibly.
- Source/content diagnostics preserve semantic evidence; hosts localize final text.
- External resolution/highlighting failures are presentation diagnostics and cannot mutate normalized source semantics.
- Model-authored terminal/URI content is inert until a host validates/authorizes it at its trust boundary.
- A host must reject stale resolution/highlight results whose session, revision or generation no longer matches.

## Syntax notes

| Syntax | Projection meaning |
| --- | --- |
| GFM table | Standard normalized table with alignment/source shape; creative interpretation is separate annotation data |
| `@Rin` | Semantic mention token resolved only through caller-provided candidates |
| `![alt](P1#panel_2)` | CommonMark image target plus host resolution hint |
| `![[cover.png]]` | Neko resource-reference embed; unresolved/unsupported behavior remains diagnostic until host resolution exists |
| `[[script.md#Scene 2]]` | Neko document/resource link token, not automatically media |
| semantic prompt span metadata | Read-only display/handoff annotation for prompt-first creative workflows |

## Migration from removed TUI APIs

The Agent TUI no longer owns or exports its regex Markdown parser, per-line regex syntax highlighter, final-only `MarkdownRenderer`, or assistant `StreamingText` Markdown path. New TUI callers must provide stable content identity and authoritative source to the canonical renderer/session path. `StreamingText` remains only for explicitly named non-Markdown status/progress/plain-text responsibilities.
