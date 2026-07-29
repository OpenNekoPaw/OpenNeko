/**
 * useClickOutside Hook
 * Closes menu when clicking outside
 */

import { useEffect, type RefObject } from 'react';

// Simpler version for single ref
export function useClickOutsideSingle(ref: RefObject<HTMLElement>, handler: () => void) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}
