# Validation status

Updated: 2026-08-06

The original migration evidence is superseded by
`remove-internal-versioning-and-product-migrations`. Current validation targets the stable canonical
path: `@neko/host` shell/settings contracts and services, `@neko/local-metadata` stable repositories,
and Desktop-only Electron composition. Normal startup has one authority at `~/.neko/neko.db`; there is
no JSON fallback, migration marker, import/archive workflow, downgrade export or dual write.

Current evidence is recorded in the superseding change and includes:

- Local Metadata stable-table initialization, unknown-column preservation and retired-path reachability.
- Host version-free shell/settings contracts, authority-root metadata preservation and child-local failure.
- Desktop producer/consumer tests, typecheck, startup/restart/workspace-switching scenarios and
  Workbench Surface ErrorBoundary containment.
- Repository `check:no-internal-versioning`, legacy-debt, boundary, build/test/check and strict OpenSpec
  gates.

Retired JSON and unrelated Agent/workspace/project data remain untouched. No product path reads,
imports, archives, exports, deletes or repairs them.
