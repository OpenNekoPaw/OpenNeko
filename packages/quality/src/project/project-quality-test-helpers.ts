export interface PoisonedNekoProjectAuthoringRoute {
  readonly routeId: string;
  readonly calls: () => readonly (readonly unknown[])[];
  readonly invoke: (...args: readonly unknown[]) => never;
  readonly assertNotCalled: () => void;
}

export function createPoisonedNekoProjectAuthoringRoute(
  routeId: string,
): PoisonedNekoProjectAuthoringRoute {
  const calls: (readonly unknown[])[] = [];
  return {
    routeId,
    calls: () => calls.map((call) => [...call]),
    invoke: (...args: readonly unknown[]) => {
      calls.push([...args]);
      throw new Error(`Poisoned project authoring route was invoked: ${routeId}`);
    },
    assertNotCalled: () => {
      if (calls.length > 0) {
        throw new Error(
          `Expected poisoned project authoring route not to be invoked: ${routeId}. Calls: ${calls.length}`,
        );
      }
    },
  };
}
