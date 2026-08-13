# OpenNeko bundled Plugins

This directory contains exact Plugin package roots bundled with OpenNeko Desktop. Each package uses a root
`plugin.json` and fixed optional `skills/` and `mcp.json` components. The directory is not a Marketplace index.

Plugin enablement and local installation lifecycle are stored in OpenNeko's SQLite metadata authority. Package
contents remain filesystem-owned. External runtimes and operating-system permissions remain user-authorized and are
never implied by enabling a Plugin.
