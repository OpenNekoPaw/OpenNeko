# W4 Desktop Main Legacy Extension/Personal Skill Cutover Slice

## Scope

This slice removes the old Extension/Personal Skill composition from Desktop Main production paths:

- `apps/neko-desktop/src/main/app-host.ts`
- `apps/neko-desktop/src/main/index.ts`
- `apps/neko-desktop/src/main/ipc.ts`

Removed dependencies/operations:

- `@neko/agent-runtime/extensions` `AgentExtensionManager` / `createAgentExtensionManager`
- `@neko/agent-runtime/pi` `PersonalSkillManager` / `createPersonalSkillManager`
- `DesktopAppHostOptions.extensionManager`
- `DesktopAppHostOptions.personalSkillManager`
- `DesktopAppHostOptions.selectLocalPluginDirectory`
- `DesktopAppHost.executeExtensionManagement`
- Extension/Personal Skill projection and plugin snapshot helpers
- IPC handler for `AGENT_EXTENSION_MANAGEMENT_HOST_CHANNEL`

The corresponding app-host tests and helper fakes for Extension/Personal Skill were removed. A new poison test asserts Desktop Main source does not import/instantiate these retired managers.

## Remaining Owner

Preload/renderer still reference the old extension-management channel/surface (`extension-management-host` contracts, `DesktopExtensionManagementRuntime`, `DesktopExtensionManagementSurface`, agent-webview extension-management root). Those are not removed in this slice. Calls through the removed IPC handler now fail rather than silently succeed, but the old consumer surface remains and is the next owner.

## Verification

- `pnpm --dir apps/neko-desktop exec vitest run src/main/retired-extension-composition-poison.test.ts` passed.
- `pnpm --dir apps/neko-desktop exec vitest run src/main/app-host.test.ts` is blocked by unrelated delete-first missing exports (`@neko/agent-runtime/tool-registry`, `@neko/agent-runtime/pi`) outside this slice.
- `git diff --check` passed for touched files.
