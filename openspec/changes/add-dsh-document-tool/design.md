# Design

## Ownership and path

`@neko/content` owns document formats, authorized locators, parsing, cursors, and representations. `@neko/content` also owns the canonical `openneko.document` schema because the schema is a public domain contract over that service. `@neko/agent-runtime` owns only the DSH Host adapter and handler delegation. Desktop owns workspace grant resolution and concrete service construction. `@neko/content-dsh-plugin` owns only DSH Tool registration and delegation through the public Host Tool port.

The canonical path is:

```text
DSH openneko.document
  -> DSH ACP reverse Host port
  -> agent-runtime DocumentDshHostAdapter
  -> Desktop exact Conversation binding
  -> workspace grant + @neko/content services
```

No `ReadDocument`/`ReadImage` alias, Pi runtime path, raw path input, or active-workspace fallback is retained.

## Contract

Tool name: `openneko.document`

Operations:

- `read`: accepts a Conversation-scoped `inputRef` and optional mode/limits; returns bounded text/manifest/range facts plus issued refs.
- `continue`: accepts an issued `cursorRef` and exact `inputRef`; returns the next bounded page.
- `read-images`: accepts the same canonical `ContentLocator` plus an optional image limit and returns bounded image metadata. Native DSH image attachment delivery remains owned by the DSH attachment/provider path; this operation must not accept paths or archive entry names.

The first implementation exposes the existing content runtime result as lossless JSON facts. Binary image bytes never cross the ACP JSON contract.

## Failure and security

- Inputs are exact-key decoded and reject old PascalCase names, raw paths, absolute paths, and invalid locator-shaped objects.
- The Host resolves only the exact Conversation binding and workspace grant.
- A missing document service, invalid reference, unsupported format, or unavailable representation fails the current tool call with a typed diagnostic.
- No result is synthesized from cache, active workspace, old projection, or alternate provider.

## Test strategy

- Contract tests prove canonical name/operations and rejection of legacy names/raw paths.
- Adapter and Desktop tests prove exact dispatch, context binding, and sibling isolation.
- Plugin tests prove one official DSH definition and no direct filesystem/domain imports.
- Profile/runtime closure tests prove the new package is bundled.
- Prompt/inventory tests prove the active model-facing names no longer mention `ReadDocument`/`ReadImage`.
