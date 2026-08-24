# canvas-node-drag-surfaces Specification

## Purpose

Define which Canvas node chrome surfaces may initiate canonical node dragging while preserving content scrolling and interactive-child ownership.

## Requirements

### Requirement: Node labels and vertical edges start canonical node dragging

Canvas Webview SHALL treat an unselected, unlocked node's external label and narrow top and bottom edge rails as node drag surfaces. These surfaces SHALL delegate to the same BaseNode drag hook used by ordinary node chrome.

#### Scenario: User drags an external node label

- **WHEN** the user presses the primary pointer button on a node's external title
- **THEN** the exact node SHALL become selected and begin the canonical drag gesture
- **AND** the viewport pan gesture SHALL NOT own that press

#### Scenario: User drags a node edge

- **WHEN** the user presses the primary pointer button on the top or bottom edge rail of an unselected, unlocked node
- **THEN** the exact node SHALL begin the canonical drag gesture
- **AND** the rail SHALL NOT cover the node's content or scrollbar

### Requirement: Specialized interaction surfaces retain ownership

Canvas Webview SHALL NOT start node dragging from buttons, inputs, explicit drag-block regions or scrollbar hit regions. Selected resize handles SHALL retain priority over edge rails, and locked nodes SHALL remain immovable.

#### Scenario: User presses the content scrollbar

- **WHEN** a text or Markdown node has overflow and the user presses within its horizontal or vertical scrollbar hit region
- **THEN** the content scroller SHALL own the interaction
- **AND** Canvas SHALL NOT start node or viewport dragging

#### Scenario: User presses a selected resize handle

- **WHEN** a selected node exposes a resize handle over its top or bottom edge
- **THEN** resize SHALL start instead of node dragging

#### Scenario: User presses an interactive child control

- **WHEN** the primary button is pressed on a button, input or explicit drag-block descendant
- **THEN** the child interaction SHALL remain local
- **AND** the node SHALL NOT move
