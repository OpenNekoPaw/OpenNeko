import { createContext, useContext, type ReactNode } from 'react';
import type { DirectGenerationOperationPort } from '@neko/generation';

const DirectGenerationOperationContext = createContext<DirectGenerationOperationPort | undefined>(
  undefined,
);

export function DirectGenerationOperationProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value?: DirectGenerationOperationPort;
}) {
  return (
    <DirectGenerationOperationContext.Provider value={value}>
      {children}
    </DirectGenerationOperationContext.Provider>
  );
}

export function useDirectGenerationOperationPort(): DirectGenerationOperationPort | undefined {
  return useContext(DirectGenerationOperationContext);
}
