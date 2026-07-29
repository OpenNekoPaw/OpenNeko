import { CapabilityUnavailableError } from './lazy-capability.ts';
import type { CapabilityDiagnostic, LazyCapability } from './types.ts';

export type CapabilityUnavailableReporter = (
  diagnostic: CapabilityDiagnostic,
) => void | Promise<void>;

export async function invokeCapability<TValue, TResult>(
  capability: LazyCapability<TValue>,
  operation: (value: TValue, signal: AbortSignal | undefined) => TResult | Promise<TResult>,
  reportUnavailable: CapabilityUnavailableReporter,
  signal?: AbortSignal,
): Promise<TResult> {
  let value: TValue;
  try {
    value = await capability.get(signal);
  } catch (error) {
    if (error instanceof CapabilityUnavailableError) {
      await reportUnavailable(error.diagnostic);
    }
    throw error;
  }
  return operation(value, signal);
}
