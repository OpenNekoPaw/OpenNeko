# OpenNeko for VSCode composition

`apps/neko-vscode` is the sole installed VS Code extension. It owns the OpenNeko
composition runtime, merged manifest, platform VSIX packaging, release metadata,
and product-level acceptance.

```text
apps/neko-vscode
  -> scoped embedded feature lifecycle
  -> dist/features/<package>
  -> packages/neko-*/package.json and owning runtime
```

Feature packages remain independently buildable and package-owned, but their
VSIX files are temporary assembly inputs rather than public artifacts. The
application activates them in dependency order and exposes cross-feature APIs
through the shared embedded registry.
