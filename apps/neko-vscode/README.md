# OpenNeko for VSCode

OpenNeko for VSCode is the single installable OpenNeko application extension.
Each supported platform receives one complete VSIX containing every retained
feature and the platform-specific Engine runtime.

- Product identity: `neko.neko-suite`
- Product build/package root and Extension Host composition: `apps/neko-vscode`
- Feature implementations and Custom Editors: owned by their respective
  `packages/neko-*` source packages and embedded as build-time payloads

The application root owns lifecycle composition, scoped feature contexts,
manifest merging, and final packaging. Domain implementations remain in their
owning packages and are not published as separate VSIX files.
