# Change: Restore DSH input catalog for Agent Drafts

## Why

Entry and Workspace Agent Drafts have no durable OpenNeko Conversation yet. The Desktop composer currently reads the DSH command and Skill catalog only through a Conversation-bound Session client, so a missing `conversationId` is projected as an absent catalog. This makes `/` and `$` disappear before the first turn even though DSH can discover the effective preset catalog before a durable product Conversation exists. Workspace `@` still works because it is resolved from the exact Workspace presentation binding, which exposes the accidental lifecycle split.

## What Changes

- Add one DSH-owned pre-turn input-catalog query that mounts the configured Agent preset, reads the effective command and user-invocable Skill catalog, and tears down its temporary runtime scope without publishing a durable DSH Session.
- Let Desktop composer configuration use the pre-turn catalog for Drafts and the exact bound Session catalog for existing Conversations.
- Keep first command or Skill submission on the existing atomic Conversation/DSH Session creation path; the new exact Session remains authoritative for execution and revalidates the selected entry.
- Strengthen deterministic and visible Desktop regression coverage for Entry Draft `/`, Workspace Draft `$` and `@`, first-submit identity creation, and existing Conversation behavior.

## Impact

- Owning runtime boundary: `@neko/dsh-bridge` owns preset-scoped command and Skill discovery.
- Host-neutral client contract: `@neko/agent-runtime` permits input-catalog reads without a Session id.
- Desktop composition: `apps/neko-desktop` selects pre-turn versus Conversation-bound discovery from the exact Agent Surface scope; it does not own catalog business rules.
- Renderer/preload composer shapes remain unchanged.
- No hidden Conversation, durable DSH Session, compatibility path, provider fallback, or user-data migration is introduced.
