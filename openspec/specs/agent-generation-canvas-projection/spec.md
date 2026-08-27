# agent-generation-canvas-projection Specification

## Purpose

Project Agent-originated Generation Jobs into the exact Workspace Canvas through stable Job and content authority.

## Requirements

### Requirement: Agent Generation Jobs are projected when the durable JobRef is published

The system SHALL immediately upsert one Generation node on the exact admitted Canvas when an Agent Generation
Tool publishes a durable Job for a Workspace Turn, before waiting for Job settlement.

#### Scenario: Generation submission starts running

- **WHEN** `openneko_generation submit` returns an authoritative non-terminal Generation Job snapshot
- **THEN** the Host SHALL deliver that snapshot to the Canvas target admitted for the exact DSH
  Session and Turn
- **AND** Canvas SHALL persist one Generation node identified by the exact Generation JobRef with its
  canonical Recipe, exact run binding and authoritative runtime status

#### Scenario: Agent Job has no submission idempotency identity

- **WHEN** Generation publishes an Agent-created Job snapshot with an authoritative JobRef and no
  optional `submissionId`
- **THEN** Canvas SHALL bind, resume and observe the Generation node by the exact JobRef
- **AND** Canvas SHALL NOT fabricate a `submissionId` from `jobId` or mark the Job outcome unknown

#### Scenario: The Turn has no admitted Canvas target

- **WHEN** an Agent Generation Job is published without an exact admitted Canvas target
- **THEN** Canvas projection SHALL fail visibly for that Job
- **AND** the system SHALL NOT select an active, recent or default Canvas and SHALL NOT cancel the Job

### Requirement: Authoritative Generation snapshots update one durable Job projection

The system SHALL update the same Canvas Generation node monotonically for every authoritative snapshot
observed for an Agent-created Generation Job. Canvas SHALL remain a read-only projection of Generation
state.

#### Scenario: A Generation Job reports progress

- **WHEN** Generation emits a later pending or running snapshot for the exact JobRef
- **THEN** Canvas SHALL update the existing Generation node rather than create another node
- **AND** the visible runtime projection SHALL preserve the authoritative pending or running phase

#### Scenario: A Generation Job fails or is cancelled

- **WHEN** Generation emits failed, cancelled or outcome-unknown settlement facts
- **THEN** Canvas SHALL retain and update the Generation node with a safe diagnostic
- **AND** Canvas SHALL NOT fabricate an output node or rewrite Generation state

### Requirement: Successful Generation results are stable output references

Canvas SHALL keep the Generation node and add or reuse committed ContentLocator-backed output bindings
inside that node when an Agent-created Generation Job succeeds.

#### Scenario: One or more outputs commit

- **WHEN** a succeeded snapshot contains one or more valid whole-Workspace result ContentLocators
- **THEN** Canvas SHALL mark the Generation node completed and add or reuse the corresponding output
  bindings inside that node
- **AND** Canvas SHALL NOT create a generic Job node or sibling media/file node for the same output

#### Scenario: The same success snapshot is replayed

- **WHEN** the same Job snapshot or Tool event is delivered again
- **THEN** Canvas SHALL contain one Generation node and one output binding per distinct ContentLocator

#### Scenario: A succeeded snapshot has no valid committed locator

- **WHEN** Generation reports success without a valid whole-Workspace result ContentLocator
- **THEN** the projection SHALL fail visibly without creating source-less output nodes

### Requirement: Projection preserves exact open Workspace Board content

The system SHALL apply Agent Generation projection to the exact current Workspace Board document and
persist the combined result without discarding user-authored Canvas changes.

#### Scenario: The target Board has unsaved user changes

- **WHEN** an exact admitted Workspace Board is open with unsaved user-authored changes
- **AND** a Generation snapshot is delivered to that same Board
- **THEN** Canvas SHALL merge the Generation node mutation into the open document
- **AND** atomically persist and immediately project the combined document

#### Scenario: Multiple dirty views diverge

- **WHEN** multiple exact views of the same Workspace Board contain divergent unsaved documents
- **THEN** delivery SHALL fail visibly as a local projection conflict
- **AND** Canvas SHALL NOT choose an active or recent view or overwrite either document
