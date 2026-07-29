import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  AgentConfigCategory,
  ComposerControlMenuId,
  ComposerMenuState,
  GenCategory,
} from './types';

type ComposerMenuStateAction =
  ComposerMenuState | ((previous: ComposerMenuState) => ComposerMenuState);
export type ComposerMenuStateUpdater = (action: ComposerMenuStateAction) => void;

interface ComposerMenuRuntimeValue {
  readonly state: ComposerMenuState;
  readonly update: ComposerMenuStateUpdater;
}

const ComposerMenuRuntimeContext = createContext<ComposerMenuRuntimeValue | null>(null);

export function ComposerMenuRuntimeProvider({
  state,
  update,
  children,
}: {
  readonly state: ComposerMenuState;
  readonly update: ComposerMenuStateUpdater;
  readonly children: ReactNode;
}) {
  const value = useMemo(() => ({ state, update }), [state, update]);
  return (
    <ComposerMenuRuntimeContext.Provider value={value}>
      {children}
    </ComposerMenuRuntimeContext.Provider>
  );
}

export function useComposerControlMenu(
  menuId: ComposerControlMenuId,
): readonly [boolean, (open: boolean) => void] {
  const runtime = useContext(ComposerMenuRuntimeContext);
  const update = runtime?.update;
  const [localOpen, setLocalOpen] = useState(false);
  const setOpen = useCallback(
    (open: boolean) => {
      if (!update) {
        setLocalOpen(open);
        return;
      }
      update((state) => ({
        ...state,
        controls: {
          ...state.controls,
          openMenu: open
            ? menuId
            : state.controls.openMenu === menuId
              ? null
              : state.controls.openMenu,
        },
      }));
    },
    [menuId, update],
  );
  return [runtime ? runtime.state.controls.openMenu === menuId : localOpen, setOpen] as const;
}

export function useComposerAgentConfigCategory(
  initialCategory: AgentConfigCategory,
): readonly [AgentConfigCategory, (category: AgentConfigCategory) => void] {
  const runtime = useContext(ComposerMenuRuntimeContext);
  const update = runtime?.update;
  const [localCategory, setLocalCategory] = useState(initialCategory);
  const setCategory = useCallback(
    (category: AgentConfigCategory) => {
      if (!update) {
        setLocalCategory(category);
        return;
      }
      update((state) => ({
        ...state,
        controls: { ...state.controls, agentConfigCategory: category },
      }));
    },
    [update],
  );
  return [runtime?.state.controls.agentConfigCategory ?? localCategory, setCategory] as const;
}

export function useComposerUnderstandingCategory(): readonly [
  GenCategory | null,
  (category: GenCategory | null) => void,
] {
  const runtime = useContext(ComposerMenuRuntimeContext);
  const update = runtime?.update;
  const [localCategory, setLocalCategory] = useState<GenCategory | null>(null);
  const setCategory = useCallback(
    (category: GenCategory | null) => {
      if (!update) {
        setLocalCategory(category);
        return;
      }
      update((state) => ({
        ...state,
        controls: { ...state.controls, understandingCategory: category },
      }));
    },
    [update],
  );
  return [runtime?.state.controls.understandingCategory ?? localCategory, setCategory] as const;
}
