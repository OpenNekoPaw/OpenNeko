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
