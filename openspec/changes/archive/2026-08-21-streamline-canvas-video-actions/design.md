## Context

Canvas material actions are resolved by `@neko/canvas-domain`, projected by the Canvas Webview, and
executed through the Desktop Canvas runtime. Cut already owns OTIO sessions and media append commands,
while Desktop owns the Window/Workbench projection that identifies the currently visible Cut View.
The current Canvas catalog only contributes `cut:open` for `.otio` documents, and the Webview places
the first five resolved actions in the floating toolbar without regard to user intent.

The change crosses Canvas domain/Webview, Cut runtime, and the Desktop trust boundary. Renderer code
must continue to receive only stable identities and `ContentLocator`; it must not receive raw paths or
perform OTIO mutation.

## Goals / Non-Goals

**Goals:**

- Keep `.otio` opening and audio/video insertion as two distinct, unambiguous actions.
- Resolve an Add-to-Cut handoff against the exact visible Cut View, or an explicit new-draft target
  when no Cut View is visible.
- Reject a handoff if its target changed between action resolution and execution.
- Make the Canvas selection toolbar prioritize creative actions and move file/library/node management
  into a grouped overflow menu.
- Reuse the existing Cut media probe/import/link/command path and authoritative snapshot publication.

**Non-Goals:**

- Adding a second timeline implementation, embedded node timeline, or renderer-owned OTIO state.
- Providing a picker for historical or hidden Cut documents in this iteration.
- Moving inline video playback out of the media node or changing hover/manual playback ownership.
- Combining project and global Media Libraries or changing their copy semantics.

## Decisions

### Canvas descriptors carry owner-projected execution payloads

`CanvasMaterialActionDescriptor` gains an optional JSON-safe execution payload. The Canvas Webview
passes that payload unchanged when invoking the descriptor. Before execution, the Canvas session
resolves the current descriptor again, and the action owner compares the submitted payload with the
current owner-projected payload. This makes a changed Cut target fail locally instead of silently
retargeting the command.

The owner remains `@neko/canvas-domain`; its canonical public path is the package material-action
contract and `createCanvasMaterialActionOwner`. Desktop Canvas is the producer adapter, Canvas Webview
is the consumer, and preload/Main remains the runtime boundary. This replaces the current action-ID-
only execution for target-sensitive handoffs. No user data is persisted in the descriptor.

Alternatives considered: a renderer-side Cut lookup would violate the Host boundary; a server-side
token registry would add lifecycle state without improving the single-window local workflow; resolving
only at click time could silently select a different Cut than the one represented when the action was
shown.

### The visible Cut View or a new draft is the only target

The Desktop Cut application boundary projects one of two target modes for an exact Canvas identity:

- `existing`: the currently docked active Cut View with its View, View instance, document, and session
  identities;
- `new-draft`: the current Workspace Workbench identity when no Cut View is docked.

Hidden and historical Cut Views are not candidates. Execution revalidates the Window renderer session,
Workspace Workbench, and target mode. An existing target is passed to the Cut application runtime; a
new-draft target invokes the existing Cut draft owner, obtains the newly created exact View, and then
uses the same Cut media append path.

The owner of OTIO mutation is `@neko/cut-node` through `CutApplicationRuntime.addResource`; the canonical
consumer is the Cut document session. `DesktopCutRuntime` retains only the Electron application-boundary
composition that requires Window/Workbench projection and Cut View creation. That logic is not
host-neutral because the choice is defined by the currently visible Desktop slot. The replaced behavior
is absence of a Canvas media handoff; `.otio` opening remains unchanged. Source media is not overwritten,
and only the exact Cut session becomes dirty.

Alternatives considered: selecting an active/recent Cut globally would violate exact identity rules;
showing a target picker would be useful once multiple simultaneous visible Cut targets exist, but the
current product exposes one Cut Panel slot; requiring users to pre-create a Cut adds unnecessary steps
when the new-draft lifecycle already exists.

### Toolbar placement is semantic rather than count based

The Canvas Webview assigns a presentation tier and overflow group from canonical action IDs. For a
single audio/video node, `cut:add-resource` is primary and Preview is secondary; reveal, Media Library
copies, node duplication, and deletion are overflow actions. `.otio` keeps `cut:open` as its creative
handoff. Generation actions remain primary. Multi-selection keeps Group primary and Delete in overflow.

Project/global Media Library commands remain independent commands but render under one Media Library
group. `node:duplicate` is labeled "Duplicate node" / "创建节点副本". Inline media playback remains in
the node and is never synthesized as a toolbar action.

The owner is `@neko/canvas-webview`; the canonical path is `SelectionContextToolbar`. Its producer is
the Canvas material-action projection and its consumer is the visible Canvas Root. This replaces
`MAX_PRIMARY_ACTIONS` ordering. It changes presentation only and has no user-data impact.

## Risks / Trade-offs

- [Creating a draft succeeds but media probing fails] -> Keep the empty draft visible with the local
  error; do not silently discard a user-visible document instance after partial application-boundary
  success.
- [The Cut target changes while the toolbar is visible] -> Re-resolve descriptors during execution and
  reject mismatched execution payloads before Cut mutation.
- [Overflow grouping hides less frequent commands] -> Keep all existing commands reachable with explicit
  group labels and test primary/overflow placement.
- [Existing action descriptors omit a payload] -> Treat absence as the canonical empty payload and keep
  all non-target-sensitive actions unchanged.

## Migration Plan

Update the single canonical Canvas descriptor shape, parser, producer, Webview consumer, fixtures, and
tests atomically. Add the Cut handoff adapter and wire it into the existing Desktop Canvas runtime. No
persisted Canvas, OTIO, or presentation data migration is required. Rollback consists of removing the
new descriptor and adapter while retaining the existing `.otio` open path.

## Open Questions

None for the current single visible Cut Panel model. A future visible multi-Cut composition must add an
explicit target chooser through a separate change rather than selecting by recency.
