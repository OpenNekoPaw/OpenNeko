# OpenNeko Extension Marketplace

This directory is the small first-party extension snapshot shipped with OpenNeko Desktop. It is not a qualification,
certification, or managed third-party package registry.

Each entry points to a contained package directory. Packages use `.openneko-plugin/plugin.json` for display metadata
and contribution locators, portable `SKILL.md` directories for Agent Skills, and optional standard MCP configuration.
Third-party and user packages use the same public manifest and discovery path; OpenNeko does not promise their quality.

The manifest keeps `interface.shortDescription` as the canonical introduction. Optional translations use exact
lower-case locale keys under `interface.localization`:

```json
{
  "interface": {
    "shortDescription": "Browser observation",
    "localization": {
      "zh-cn": { "shortDescription": "浏览器观察能力" }
    }
  }
}
```

Browser Use and Computer Use are included as bundled OpenNeko adapter descriptors. Their external dependencies use a
separately authorized, user-managed local runtime. Enabling an adapter only loads its OpenNeko contributions. It never
downloads, installs, updates, or removes Browser Use/Cua files, and it does not grant Tool-call or operating-system
permission.

The user installs and maintains the external runtime using its upstream instructions, then explicitly authorizes the
required runtime resources in OpenNeko. Runtime readiness is determined from the current selected path, MCP server
identity, required operation structure, and applicable Host security checks. Third-party release strings are retained as
package facts but are not an OpenNeko compatibility gate.

Do not mirror another application's marketplace or Skill directory into this snapshot. New bundled entries must be
maintained in this repository and use the same public Plugin/Skill/MCP contracts available to third parties.
