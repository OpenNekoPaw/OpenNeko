## System boundary

Each Desktop Window owns one stable Shell, Primary Sidebar, and Workbench composition. Navigation selects a Scene; the Scene references exact package-owned surfaces for visible slots. Domain records, Agent tasks, documents, and media runtimes retain their own identities and lifecycles.

## Core invariants

- Home, Project, management, and Settings do not create parallel application shells.
- Only currently visible or explicitly split business Roots are mounted.
- Navigation state never becomes domain, Conversation, document, or background-task authority.
- Leaving a Scene releases unprotected UI/runtime resources while preserving durable facts and protected work.
- A failing surface remains local and cannot replace sibling owners or collapse the Window Shell.

## Product acceptance

The capability is complete when the core entry, project, Agent, resource, Canvas, Cut, Preview, management, and Settings workflows compose through the same Window architecture and survive navigation, reload, and reopen with exact identity.

## Non-goals

This change does not create a universal Session model, retain every visited Root, or merge domain stores into the Shell.
