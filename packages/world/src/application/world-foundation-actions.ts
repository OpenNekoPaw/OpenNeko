import {
  parseWorldActionIntent,
  parseWorldFact,
  worldFactSemanticRef,
  type WorldActionIntent,
  type WorldFact,
} from '@neko/world/contracts';
import type { WorldActionHandler } from './world-runtime-service';

export const WORLD_FOUNDATION_FACT_SET_ACTION = 'world.foundation.fact.set' as const;
export const WORLD_FOUNDATION_FACT_DELETE_ACTION = 'world.foundation.fact.delete' as const;

export function createWorldFoundationActionHandlers(): readonly WorldActionHandler[] {
  return Object.freeze([
    {
      action: WORLD_FOUNDATION_FACT_SET_ACTION,
      evaluate: ({ intent }) => ({
        mutations: [{ kind: 'set' as const, fact: parseSetFact(intent) }],
        visibility: { kind: 'public' as const },
        knownByActorIds: [intent.actorId],
      }),
    },
    {
      action: WORLD_FOUNDATION_FACT_DELETE_ACTION,
      evaluate: ({ intent, state }) => {
        const factId = requireOnlyStringParameter(intent, 'factId');
        if (!state.facts.some((fact) => fact.factId === factId)) {
          throw new Error(`World fact '${factId}' is unavailable on the exact branch.`);
        }
        return {
          mutations: [{ kind: 'delete' as const, factId }],
          visibility: { kind: 'public' as const },
          knownByActorIds: [intent.actorId],
        };
      },
    },
  ]);
}

export function createWorldFoundationSetFactIntent(input: {
  readonly identity: Omit<WorldActionIntent, 'action' | 'parameters' | 'targetRef'>;
  readonly fact: WorldFact;
}): WorldActionIntent {
  return parseWorldActionIntent({
    ...input.identity,
    action: WORLD_FOUNDATION_FACT_SET_ACTION,
    targetRef: worldFactSemanticRef(input.fact.factId),
    parameters: { fact: input.fact },
  });
}

export function createWorldFoundationDeleteFactIntent(input: {
  readonly identity: Omit<WorldActionIntent, 'action' | 'parameters' | 'targetRef'>;
  readonly factId: string;
}): WorldActionIntent {
  return parseWorldActionIntent({
    ...input.identity,
    action: WORLD_FOUNDATION_FACT_DELETE_ACTION,
    targetRef: worldFactSemanticRef(input.factId),
    parameters: { factId: input.factId },
  });
}

function parseSetFact(intent: WorldActionIntent): WorldFact {
  const keys = Object.keys(intent.parameters);
  if (keys.length !== 1 || keys[0] !== 'fact') {
    throw new Error('World Foundation fact set action requires only the fact parameter.');
  }
  return parseWorldFact(intent.parameters['fact']);
}

function requireOnlyStringParameter(intent: WorldActionIntent, key: string): string {
  const keys = Object.keys(intent.parameters);
  const value = intent.parameters[key];
  if (keys.length !== 1 || keys[0] !== key || typeof value !== 'string' || value.length === 0) {
    throw new Error(`World Foundation action requires only the ${key} string parameter.`);
  }
  return value;
}
