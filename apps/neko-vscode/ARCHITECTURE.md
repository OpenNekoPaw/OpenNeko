# OpenNeko for VSCode composition

`apps/neko-vscode` owns only the OpenNeko Extension Pack manifest, VSIX
packaging, release metadata, and product-level acceptance.

```text
apps/neko-vscode
  -> extensionPack identifiers
  -> packages/neko-*/package.json
  -> owning domain Extension runtime
```

The application has no activation entry and no runtime dependency on another
application. Member Extensions remain independently buildable and package-owned.
