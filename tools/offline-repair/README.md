# Offline repair tools

These tools are intentionally outside the OpenNeko product dependency graph. They are never
imported, bundled, started, or run by normal tests or CI. Run one only while Desktop is closed and
only after identifying the exact rejected record from a product diagnostic.

To remove one invalid Project Entity record from a current `neko/entities.json` container:

```bash
pnpm exec tsx tools/offline-repair/project-entity-record.ts \
  --target /absolute/path/to/workspace/neko/entities.json \
  --entity-id character-invalid \
  --confirm remove-project-entity:character-invalid
```

The command refuses relative paths, symlinks, ambiguous identities, invalid confirmation, and a
result that still violates the current Project Entity contract. Before the atomic write it creates
an exclusive adjacent `*.backup-*` file containing the original bytes. The backup is never deleted
or restored automatically. The replacement and backup preserve the original file's permission mode;
the tool does not impose a fixed `0600` mode.

The Character authoring transfer implementation and its focused test also live in this isolated
directory. They are intentionally not exported from `@neko/chara-node` or reachable from Desktop;
an explicit maintenance invocation must provide the exact source store and destination repository.

To inspect an exact retired Project layout without changing bytes:

```bash
pnpm exec tsx tools/offline-repair/retired-project-layout.ts \
  --target /absolute/path/to/workspace \
  --global-media-root /absolute/path/to/home/.neko/media-libraries
```

The inspection recognizes only the retired `neko/project-composition.json` shape, direct
`neko/assets/<library>` links, and linked-media `workspace-file` locators in Canvas, Cut, and Project
Entity owners. It reports a fingerprint, exact global connection matches, and any incomplete or
unassignable facts. It does not write or silently infer a connection. Explicit retired dependency rows
are rejected because they cannot be reassigned to an authoritative consumer without inventing facts.

After reviewing a `ready: true` inspection, run the same exact target with its fingerprint and Project
confirmation token:

```bash
pnpm exec tsx tools/offline-repair/retired-project-layout.ts \
  --target /absolute/path/to/workspace \
  --global-media-root /absolute/path/to/home/.neko/media-libraries \
  --fingerprint sha256:... \
  --confirm convert-retired-project:content:<workspace-uuid>
```

Desktop must be closed. The converter prepares and validates a sibling staging tree, rereads the source
fingerprint, renames the original Workspace to a timestamped immutable backup, and publishes the staged
Workspace by rename. It converts exact Entity/Character association facts, Media Library locators, and
target-free project-local bindings; removes the retired composition and `neko/assets` paths only from
the converted tree; and never reads a backup as product authority. On validation or publication failure,
the source remains at its original path and partial staging is removed.
