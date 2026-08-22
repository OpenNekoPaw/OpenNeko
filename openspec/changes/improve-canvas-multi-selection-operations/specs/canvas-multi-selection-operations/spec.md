## ADDED Requirements

### Requirement: Canvas multi-selection moves as one gesture

Canvas SHALL move every selected, unlocked movement root by the same Canvas-space delta when the user drags any selected unlocked node. The preview and committed document SHALL use the same root-selection semantics. A selected descendant whose selected movable ancestor already moves SHALL NOT receive the delta twice.

#### Scenario: User drags a multi-selection

- **WHEN** multiple nodes are selected and the user drags one selected unlocked node
- **THEN** every selected unlocked movement root follows the pointer with unchanged relative spacing
- **AND** mouseup commits all resulting positions atomically
- **AND** one undo restores every moved node to its gesture-start position
- **AND** the complete selection remains selected

#### Scenario: Selection contains a Group and its descendant

- **WHEN** both a movable Group and one of its descendants are selected during a drag
- **THEN** the Group subtree receives the drag delta exactly once
- **AND** container membership remains canonical after commit

#### Scenario: Selection contains a locked node

- **WHEN** an unlocked selected node starts a drag while another selected node is locked
- **THEN** unlocked movement roots move together
- **AND** the locked node remains selected and fixed

### Requirement: Canvas additive selection preserves existing identities

Canvas SHALL recognize Shift and the platform primary modifier for additive node click and marquee selection. Starting an additive marquee on Canvas background SHALL NOT clear the existing selection before the rectangle resolves.

#### Scenario: User adds nodes with a marquee

- **WHEN** nodes are already selected and the user starts a modified marquee from empty Canvas space
- **THEN** intersected node identities are merged with the gesture-start selection
- **AND** releasing the modifier before mouseup does not change the additive gesture decision

#### Scenario: User drags an existing selection

- **WHEN** the user starts dragging a node already in a multi-selection
- **THEN** the gesture preserves the complete selection
- **AND** the synthetic click following the drag does not collapse it to one node

### Requirement: Multi-selection commands target the complete selection

Canvas SHALL apply multi-selection duplicate, delete, front, back and lock commands to the complete eligible selection through atomic Canvas store mutations. Right-clicking a node already in the selection SHALL preserve that selection.

#### Scenario: User invokes a batch toolbar command

- **WHEN** multiple nodes are selected
- **THEN** the selection toolbar exposes Group, Duplicate and Delete
- **AND** Duplicate creates copies for all selected nodes and selects the copies
- **AND** Delete removes all selected nodes through the existing selection deletion policy

#### Scenario: User invokes a batch context command

- **WHEN** the user right-clicks a node in an existing multi-selection and chooses front, back or lock
- **THEN** the command updates every selected node in one history step
- **AND** front/back preserves the selected nodes' relative z-order

### Requirement: Unsupported batch transforms are not presented as available

Canvas SHALL keep selection outlines visible for a multi-selection but SHALL NOT render single-node resize or rotate handles while more than one node is selected.

#### Scenario: User selects multiple nodes

- **WHEN** the selection contains at least two nodes
- **THEN** all selected nodes retain their selected presentation
- **AND** no resize or rotation handle is visible until the selection returns to one node
