# OpenNeko Extension Marketplace

This directory is the first-party extension snapshot shipped by OpenNeko Desktop.
Only packages maintained in this public repository belong here.

Each catalog entry points to a contained package directory. A package uses
`.openneko-plugin/plugin.json` for display metadata and contribution locators,
portable `SKILL.md` directories for Pi Agent Skills, and optional contained MCP
configuration supported by the OpenNeko runtime.

Browser Use and Computer Use are listed from this first-party snapshot so
their reviewed scope and current qualification state are visible. Their entries
remain `unavailable` until OpenNeko publishes the exact self-contained platform
artifacts and records packaged qualification evidence; listing never permits a
download or install by itself. Release builds rely on this snapshot only through
the signed application trust root. Do not mirror Codex, OpenAI, or another
application's local marketplace into this snapshot.
