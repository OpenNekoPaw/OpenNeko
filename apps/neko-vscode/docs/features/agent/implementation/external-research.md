# External Research

External research is an opt-in Agent capability for cited creative reference intake and developer documentation lookup. It is not a default model knowledge upgrade and it is not a project-memory writer.

## Configuration

`externalResearch.mode` controls availability:

- `disabled`: no `WebSearch` or `WebFetch` tools are registered.
- `indexed`: registers `WebSearch` when a provider resolves and supports indexed search.
- `live`: registers `WebSearch` and `WebFetch` when a provider resolves and supports live fetch.

Conservative defaults:

```ts
externalResearch: {
  mode: 'disabled',
  providerId: undefined,
  requireApprovalForLive: true,
  allowProjectContextInQuery: false,
  maxResults: 5,
  maxFetchContentTokens: 12000,
}
```

The first real provider path is MCP-backed. Neko supplies the adapter boundary and schemas, but does not bundle or operate the underlying web search service.

## MCP Binding

MCP-backed external research requires explicit machine-readable binding config for server id, search/fetch tool names, argument names, and output schemas. Neko must not infer web research tools from MCP tool names or descriptions.

Bound MCP tools are adapter-only by default and are hidden from ordinary `mcp__server__tool` registration unless `exposeBoundToolsAsRawMcp` is explicitly enabled.

MCP search/fetch output must be structured JSON envelopes using:

- `neko.externalResearch.search.v1`
- `neko.externalResearch.fetch.v1`

Prose-only MCP output fails visibly.

## Safety And Persistence

`WebFetch` rejects unsafe schemes, Webview/blob/data URLs, localhost, loopback, private-network, link-local, blocked domains, and unsafe redirected final URLs before returning content.

External research results stay session-scoped by default. They must not automatically write project memory, character settings, worldbuilding, entity metadata, asset metadata, or project files. Saving requires explicit user intent and writes a Markdown `ResearchNote` with source provenance to a user-selected project document or research-note artifact. Saved research notes remain research material unless a separate explicit promotion workflow is invoked.

Project search remains local. `QueryProjectSearch` and `@neko/search` partitions do not call public web providers and do not index unsaved external results. If a user explicitly saves a Markdown `ResearchNote`, later local indexing may treat that Markdown file as a normal `documents` item; it is still research material, not canonical project memory.
