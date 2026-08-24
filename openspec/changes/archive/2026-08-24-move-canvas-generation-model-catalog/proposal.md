## Why

Desktop currently decides which configured models become Canvas generation choices, including
purpose mapping, defaults, labels, and ordering. That behavior is host-neutral Canvas domain
projection and does not require Electron ownership.

## What Changes

- Move Canvas generation model catalog projection to `@neko/canvas-domain`.
- Keep Host configuration access and capability checks behind a narrow Desktop-composed input.
- Delete the replaced Desktop implementation and its Desktop-owned test.

## Impact

- Owner: Canvas domain; package role: `contracts/domain/application`.
- Canonical entry: `@neko/canvas-domain`.
- Producer: Canvas domain projection; consumer: Desktop Canvas runtime composition.
- User data: none; the runtime-only model projection shape is unchanged.
