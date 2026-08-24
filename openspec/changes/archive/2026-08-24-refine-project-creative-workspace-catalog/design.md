## Context

`ProjectWorkspaceRoot` currently consumes `ProjectCreativeWorkspaceProjection`, while the same
authorized bridge already exposes `ProjectContentProjection` for confirmed Entity and candidate
read models. Character and World cards need owner-derived summaries and update timestamps; exact
global references need object and version labels instead of one ambiguous combined label.

## Five-layer analysis

| Layer          | Decision                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsibility | Project Webview owns search/filter/sort/card presentation. Project composition owns only the read aggregation metadata. Domain owners keep facts and commands.                                                         |
| Dependencies   | Renderer depends on the existing typed project-authoring bridge. Project application reads Chara/World/Content/Entity projections through existing ports and does not access Electron.                                 |
| Interface      | Extend the single canonical Project projection shapes with owner-derived `updatedAt`, summary, object label, and exact version label. Update all producers, consumers, codecs, fixtures, and tests atomically.         |
| Extension      | New creative kinds can add a card adapter in Project Webview without adding generic CRUD or changing another owner's facts.                                                                                            |
| Tests          | Contract/application tests prove metadata projection; Webview tests prove loading, search, filters, sorting, card actions, empty results, diagnostics, and Project isolation; Desktop tests cover the existing bridge. |

## Canonical runtime path

```text
authorized Project binding
  -> getCreativeWorkspace + getContent
  -> strict owner-qualified projections
  -> ProjectWorkspaceRoot card adapters
  -> local query/filter/sort
  -> owner command or owner navigation callback
```

The two reads remain separate canonical projections because they answer different questions:
Project composition owns membership and exact global references; Project Content owns the semantic
Entity/candidate read model. The Webview joins them only for presentation and never writes a joined
record. A failure in either required read is visible for the exact Project and does not fabricate a
partial successful catalog.

## Card model

- Content cards identify the exact project document and use its Content-owned modification time.
- Character and World cards use their owning draft summary and `updatedAt`.
- Project Entity cards use Entity kind, lifecycle availability, and `updatedAt`.
- Candidate cards use Entity kind, freshness, confidence/evidence summary, and latest observed time.
- Global reference cards show owner name and exact domain version label separately. Only references
  already attached to the Project appear in the catalog; the complete global library remains in the
  explicit add-reference control.

Missing timestamps are permitted only for invalid/unavailable records whose owner facts could not
be decoded. They remain visible and sort after dated records. The Webview does not invent a date.

## Interaction and presentation state

Search covers labels, summaries, type/scope labels, version labels, and diagnostics. Type and scope
filters are local and reversible. Default ordering is most recently updated/observed, followed by a
stable label and identity tie-breaker. Query/filter/sort/add-panel state is not authoritative and is
discarded when the Root unmounts.

Type filters are capability-derived from cards present in the authorized projection. Empty future
types therefore remain absent without adding a feature flag or a second implementation path; they
appear automatically when the canonical owner first projects a record.

Cards are compact enough for the Resource Dock and expose visible type/scope/status badges. Open,
synchronize, copy, update-version, and remove actions delegate to the existing owner-qualified
callbacks and mutations. Entity and candidate cards remain read-only until the Entity Inspector
workflow is composed; the catalog does not create a second confirmation path.

All card kinds also own disposable inline detail expansion. This is a presentation of fields already
present in the two canonical projections, not a new detail authority: local editable targets retain
their existing open action, while Entity, candidate, invalid, and global-reference cards can reveal
identity, status, metadata, and untruncated summary without requiring an editor View. Expansion does
not persist and explicitly states when editing belongs to another owner.

## User-data and failure behavior

No durable data shape changes. Invalid records remain visible with diagnostics. Action failure is
shown inside the catalog. Stale Project responses fail the exact Root. Search/filter empty results
show a distinct no-results state rather than pretending the Project is empty.
