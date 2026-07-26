## Context

The repository-local media workspace was introduced to isolate generated test
data, but the designated external `neko-test` workspace is now the required
runtime acceptance root. Directly changing the fixture generator to delete and
recreate `neko-test` would destroy unrelated test media and project state.

Five-layer analysis:

- **Responsibility:** launch/configuration owns workspace selection; the fixture
  generator owns only one generated subtree; each scenario owns its own
  `.neko/.functional` descendants.
- **Dependency:** scripts derive the canonical root from `os.homedir()` or use
  the portable VS Code `${env:HOME}` form. They do not depend on repository
  location.
- **Interface:** fixture preparation returns the generated fixture directory,
  while Development Host launch always opens the containing canonical
  workspace root.
- **Extension:** future scenarios allocate another named, marker-owned
  descendant under `.neko/.functional`; they do not add another workspace root.
- **Testing:** path contract tests assert the launch root, reject the retired
  repository-local path, verify marker-gated replacement, and reject media
  matrix roots outside `neko-test`.

## Decisions

### Generate synthetic video through a hardware-only encoder

The disposable H.264 fixture uses VideoToolbox with software fallback disabled.
Fixture preparation fails visibly when the host cannot provide that encoder;
the test path must not reintroduce a CPU video-transcode exception.

### One canonical workspace root

All Extension Development Host and Webview acceptance launches use:

```text
${HOME}/Git/neko-test
```

The VS Code JSON form is `${env:HOME}/Git/neko-test`. Repository-local `.tmp`
workspaces and other external workspaces are invalid for runtime acceptance.

### Generated fixtures are nested and marker-owned

The media fixture generator owns only:

```text
${HOME}/Git/neko-test/.neko/.functional/media-runtime
```

It writes an `.openneko-fixture.json` marker containing the schema, fixture
kind, canonical workspace locator, and workspace-relative fixture root. Before
replacement, an existing directory must contain the expected marker. Missing
or mismatched ownership fails visibly. The generator never recursively removes
`${HOME}/Git/neko-test`, `.neko`, or `.neko/.functional`.

### Runtime scripts reject paths outside the root

The media matrix defaults to `${HOME}/Git/neko-test/cases`. An explicitly
provided source directory must resolve to the canonical root or one of its
descendants. This prevents an accidental command argument from making another
workspace an accepted runtime source.

## Risks / Trade-offs

- The canonical workspace can contain user-provided test media, so automated
  scenarios must touch only their marker-owned subtree or explicitly requested
  read-only sources.
- A stale unmarked media-runtime fixture is not automatically deleted; manual
  inspection is required before ownership can be established.
- This rule deliberately does not constrain unit-test temporary directories,
  compiler outputs, dependency caches, or reports.
