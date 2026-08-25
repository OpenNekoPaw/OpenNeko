# project-entity-management-surface Specification

## Purpose

Define the Entity-owned inspection and decision surface for confirmed facts, candidates, bindings, reference blockers and local diagnostics.

## Requirements

### Requirement: Entity Inspector owns semantic management intents

The Entity Inspector SHALL expose typed create, confirm, edit, bind, unbind, merge, deprecate and
delete intents according to the selected Entity state. It MUST NOT write project files, mutate
resource-owner facts or infer destructive intent in the Renderer. Project Content MAY navigate to the
exact Entity-owned Inspector but MUST NOT fabricate another writable surface or copy Entity facts.

#### Scenario: Confirm a candidate

- **WHEN** the user reviews candidate evidence and confirms its kind and accepted facts
- **THEN** the UI submits an exact owner-qualified confirmation intent and shows the resulting confirmed Entity

#### Scenario: Merge has unresolved references

- **WHEN** the owner reports reference blockers for a proposed merge
- **THEN** the Inspector displays those blockers and does not report or locally project a completed merge

### Requirement: Candidate evidence supports explicit decisions

Candidate results SHALL expose source evidence, confidence provenance, possible confirmed matches and
explicit confirm, merge-into, dismiss or inspect actions. Dismissal SHALL affect only rebuildable
candidate workflow state and MUST NOT delete source content.

#### Scenario: Merge candidate into an existing Entity

- **WHEN** the user accepts a suggested existing Entity and selected evidence
- **THEN** the Entity owner commits only the explicitly accepted semantic facts
- **AND** source resources remain unchanged

### Requirement: Entity presentation is disposable and failure-scoped

Entity Inspector and Project Content presentation state SHALL be rebuildable and SHALL NOT become a
second Entity authority. Invalid presentation state SHALL reset only the affected surface. Invalid
Entity records or runtime responses SHALL produce owner-local diagnostics while valid sibling records
and unrelated Desktop surfaces remain available.

#### Scenario: Presentation state becomes invalid

- **WHEN** retained selection or navigation state no longer matches the current authoritative projection
- **THEN** the surface resets only that local display state and reprojects authoritative Entity facts
- **AND** it does not modify Project Entity, Project Content, Agent or Workspace state

#### Scenario: One Entity runtime record is invalid

- **WHEN** a snapshot or operation contains one invalid Entity record
- **THEN** the Entity-owned surface displays an exact local diagnostic
- **AND** valid sibling Entities and unrelated Desktop surfaces remain usable
