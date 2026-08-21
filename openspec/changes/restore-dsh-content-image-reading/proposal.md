# Proposal: Restore Content-owned image reading in DSH

The atomic Pi-to-DSH cutover retained document metadata projection but removed the
model-facing adapter for the existing Content-owned image access capability. DSH
native `read_image` can read ordinary filesystem paths, but it cannot consume an
authorized `ContentLocator` for an EPUB/CBZ archive entry. As a result,
`openneko.document` can discover an image while the active Agent cannot read its
pixels.

## Scope

- Add one canonical OpenNeko DSH image tool that accepts exact Content locators
  issued by Content capabilities.
- Load bytes through `AgentContentAccessRuntime`, transfer them over bounded ACP
  chunks, persist them in the DSH attachment store, and return a native image
  content block to an image-capable model.
- When a valid source exceeds only the active DSH per-side attachment limit,
  derive one bounded perceptual attachment representation before persistence;
  preserve the original locator and source bytes as the content authority.
- Compose the Node document-entry reader in Desktop so EPUB/CBZ entry locators
  are authorized and readable through the same workspace authority.
- Reject selector-bearing document sources; archive entries are outputs consumed
  by the image tool, not alternate document roots.

## Non-goals

- Do not restore Pi `ReadImage`, its Tool contract, or a compatibility alias.
- Do not replace or wrap DSH native `read_image` for ordinary files.
- Do not expose absolute paths, archive extraction paths, or raw binary payloads
  as one unbounded ACP response.
- Do not raise or bypass DSH attachment pixel/byte limits, mutate the source, or
  persist the derived perception representation as a Workspace artifact.

## Impact

`@neko/content` owns the locator/image chunk contract, `@neko/agent-runtime`
owns the ACP Host adapter, `@neko/content-dsh-plugin` owns DSH registration and
attachment admission, and Desktop owns exact Workspace authorization plus the
concrete Node archive reader.
