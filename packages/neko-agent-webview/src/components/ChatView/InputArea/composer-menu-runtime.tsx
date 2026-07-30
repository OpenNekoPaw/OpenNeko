import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  ComposerConfigCategory,
  ComposerConfigSection,
  ComposerControlMenuId,
  ComposerMenuState,
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

export function useComposerConfigCategory(
  initialCategory: ComposerConfigCategory,
): readonly [ComposerConfigCategory, (category: ComposerConfigCategory) => void] {
  const runtime = useContext(ComposerMenuRuntimeContext);
  const update = runtime?.update;
  const [localCategory, setLocalCategory] = useState(initialCategory);
  const setCategory = useCallback(
    (category: ComposerConfigCategory) => {
      if (!update) {
        setLocalCategory(category);
        return;
      }
      update((state) => ({
        ...state,
        controls: { ...state.controls, configCategory: category },
      }));
    },
    [update],
  );
  return [runtime?.state.controls.configCategory ?? localCategory, setCategory] as const;
}

export function useComposerConfigSection(
  initialSection: ComposerConfigSection,
): readonly [ComposerConfigSection, (section: ComposerConfigSection) => void] {
  const runtime = useContext(ComposerMenuRuntimeContext);
  const update = runtime?.update;
  const [localSection, setLocalSection] = useState(initialSection);
  const setSection = useCallback(
    (section: ComposerConfigSection) => {
      if (!update) {
        setLocalSection(section);
        return;
      }
      update((state) => ({
        ...state,
        controls: { ...state.controls, configSection: section },
      }));
    },
    [update],
  );
  return [runtime?.state.controls.configSection ?? localSection, setSection] as const;
}
