export interface FrameServerConfigMessage {
  type: 'frameServer:config';
  port: number;
}

export interface FrameServerStreamCreatedMessage {
  type: 'frameServer:streamCreated';
  streamId: string;
  wsUrl?: string | null;
  audioStreamId?: string | null;
  audioWsUrl?: string | null;
}

export interface FrameServerStreamStoppedMessage {
  type: 'frameServer:streamStopped';
  streamId?: string;
}

export type FrameServerMessage =
  | FrameServerConfigMessage
  | FrameServerStreamCreatedMessage
  | FrameServerStreamStoppedMessage;

const FRAME_SERVER_MESSAGE_EVENT = 'neko-cut:frame-server-message';

let latestConfig: FrameServerConfigMessage | null = null;
let latestStream: FrameServerStreamCreatedMessage | null = null;

export function isFrameServerMessage(message: unknown): message is FrameServerMessage {
  if (!message || typeof message !== 'object') return false;
  const type = (message as { type?: unknown }).type;
  return (
    type === 'frameServer:config' ||
    type === 'frameServer:streamCreated' ||
    type === 'frameServer:streamStopped'
  );
}

export function publishFrameServerMessage(message: FrameServerMessage): void {
  if (message.type === 'frameServer:config') {
    if (latestConfig?.port === message.port) {
      return;
    }
    latestConfig = message;
  } else if (message.type === 'frameServer:streamCreated') {
    if (
      latestStream?.streamId === message.streamId &&
      latestStream.wsUrl === message.wsUrl &&
      latestStream.audioStreamId === message.audioStreamId &&
      latestStream.audioWsUrl === message.audioWsUrl
    ) {
      return;
    }
    latestStream = message;
  } else if (message.type === 'frameServer:streamStopped') {
    if (!latestStream) {
      return;
    }
    latestStream = null;
  }

  window.dispatchEvent(new CustomEvent(FRAME_SERVER_MESSAGE_EVENT, { detail: message }));
}

export function addFrameServerMessageListener(
  listener: (message: FrameServerMessage) => void,
): () => void {
  const handleEvent = (event: Event) => {
    listener((event as CustomEvent<FrameServerMessage>).detail);
  };

  window.addEventListener(FRAME_SERVER_MESSAGE_EVENT, handleEvent);
  return () => window.removeEventListener(FRAME_SERVER_MESSAGE_EVENT, handleEvent);
}

export function getLatestFrameServerConfig(): FrameServerConfigMessage | null {
  return latestConfig;
}

export function getLatestFrameServerStream(): FrameServerStreamCreatedMessage | null {
  return latestStream;
}
