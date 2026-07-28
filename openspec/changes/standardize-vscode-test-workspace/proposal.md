## Why

OpenNeko currently names two incompatible Extension Development Host test
workspaces: `${HOME}/Git/neko-test` and a repository-local
`.tmp/vscode-test-workspaces/media-runtime` directory. The launch contract,
fixture generator, debugger Skill, validation scripts, and active OpenSpec
requirements therefore disagree about which runtime evidence is authoritative.

## What Changes

- Make `${HOME}/Git/neko-test` the only workspace root for VS Code Extension
  Development Host, Webview, and real-media acceptance.
- Generate disposable synthetic media only below the marker-owned
  `${HOME}/Git/neko-test/.neko/.functional/media-runtime` subtree.
- Forbid launch configurations and runtime validation scripts from selecting a
  repository-local or other external test workspace.
- Preserve existing files in `${HOME}/Git/neko-test`; fixture preparation may
  replace only its own marker-verified subtree and must never delete the
  workspace root.
- Keep unit-test framework temporary directories, build outputs, caches, and
  gitignored reports outside this workspace rule because they are not
  Extension Development Host workspaces.

## Capabilities

### New Capabilities

- `canonical-vscode-test-workspace`: Defines the one allowed runtime
  acceptance workspace, generated fixture ownership, and path rejection rules.

## Impact

- Affects VS Code launch/task configuration contracts.
- Affects the media fixture generator and media matrix default/root checks.
- Affects the repository `vscode-extension-debugger` Skill and current
  architecture/OpenSpec statements.
- Does not migrate, delete, or rewrite existing user-provided media in
  `${HOME}/Git/neko-test`.
