import { parseRoomView, type RoomView } from './room';
import { requireExactRecord, requireIdentity, requireNonNegativeInteger } from './codec';

export const CHARACTER_ROOM_WORKBENCH_CHANNELS = {
  snapshotGet: 'neko:character:room-workbench:snapshot-get',
  projectionEvent: 'neko:character:room-workbench:projection-event',
} as const;

export type CharacterRoomWorkbenchProjection = RoomView;

export interface CharacterRoomWorkbenchSnapshotRequest {
  readonly requestId: string;
  readonly roomRunId: string;
}

export interface CharacterRoomWorkbenchSnapshotResult {
  readonly requestId: string;
  readonly sequence: number;
  readonly projection: CharacterRoomWorkbenchProjection;
}

export interface CharacterRoomWorkbenchProjectionEvent {
  readonly requestId: string;
  readonly sequence: number;
  readonly projection: CharacterRoomWorkbenchProjection;
}

export interface OpenNekoDesktopCharacterRoomWorkbenchBridge {
  readonly characterRoomWorkbench: {
    getSnapshot(roomRunId: string): Promise<CharacterRoomWorkbenchProjection>;
    subscribe(
      roomRunId: string,
      listener: (event: CharacterRoomWorkbenchProjectionEvent) => void,
    ): () => void;
  };
}

export function createCharacterRoomWorkbenchSnapshotRequest(
  requestId: string,
  roomRunId: string,
): CharacterRoomWorkbenchSnapshotRequest {
  return {
    requestId: requireIdentity(requestId, 'Character Room Workbench request'),
    roomRunId: requireIdentity(roomRunId, 'RoomRun'),
  };
}

export function parseCharacterRoomWorkbenchSnapshotRequest(
  value: unknown,
): CharacterRoomWorkbenchSnapshotRequest {
  const record = requireExactRecord(
    value,
    ['requestId', 'roomRunId'],
    'Character Room Workbench snapshot request',
  );
  return createCharacterRoomWorkbenchSnapshotRequest(
    requireIdentity(record['requestId'], 'Character Room Workbench request'),
    requireIdentity(record['roomRunId'], 'RoomRun'),
  );
}

export function parseCharacterRoomWorkbenchSnapshotResult(
  value: unknown,
  request: CharacterRoomWorkbenchSnapshotRequest,
): CharacterRoomWorkbenchSnapshotResult {
  const record = requireExactRecord(
    value,
    ['requestId', 'sequence', 'projection'],
    'Character Room Workbench snapshot result',
  );
  if (record['requestId'] !== request.requestId) {
    throw new Error('Character Room Workbench response request identity does not match.');
  }
  const projection = parseRoomView(record['projection']);
  if (projection.roomRunId !== request.roomRunId) {
    throw new Error('Character Room Workbench response RoomRun identity does not match.');
  }
  return {
    requestId: request.requestId,
    sequence: requireNonNegativeInteger(
      record['sequence'],
      'Character Room Workbench snapshot event sequence',
    ),
    projection,
  };
}

export function parseCharacterRoomWorkbenchProjectionEvent(
  value: unknown,
): CharacterRoomWorkbenchProjectionEvent {
  const record = requireExactRecord(
    value,
    ['requestId', 'sequence', 'projection'],
    'Character Room Workbench projection event',
  );
  return {
    requestId: requireIdentity(record['requestId'], 'Character Room Workbench event request'),
    sequence: requireNonNegativeInteger(
      record['sequence'],
      'Character Room Workbench event sequence',
    ),
    projection: parseRoomView(record['projection']),
  };
}
