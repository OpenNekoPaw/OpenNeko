import type { MultimodalContextPacket } from '@neko/shared';

export interface PerceptionInputMaterializerContext {
  readonly workspaceRoot?: string;
  readonly signal?: AbortSignal;
}

export interface PerceptionInputMaterializer {
  materialize(
    packet: MultimodalContextPacket,
    context: PerceptionInputMaterializerContext,
  ): Promise<MultimodalContextPacket>;
}

export interface ResolvePerceptionContextPacketOptions extends PerceptionInputMaterializerContext {
  readonly materializer?: PerceptionInputMaterializer | null;
}

export async function resolvePerceptionContextPacket(
  packet: MultimodalContextPacket,
  options: ResolvePerceptionContextPacketOptions = {},
): Promise<MultimodalContextPacket> {
  if (!options.materializer) {
    return packet;
  }

  return options.materializer.materialize(packet, {
    ...(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
