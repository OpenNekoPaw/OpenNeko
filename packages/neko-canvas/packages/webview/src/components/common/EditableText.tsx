/**
 * EditableText - Inline editable text component
 * Double-click to enter edit mode, blur/Enter to confirm, Escape to cancel
 *
 * In VS Code webview, we need special handling:
 * - stopPropagation on all keyboard events to prevent VS Code from intercepting
 * - Use contentEditable as fallback if input/textarea doesn't receive keys
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';

// =============================================================================
// Types
// =============================================================================

export interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  /** Use textarea for multiline editing */
  multiline?: boolean;
  /** When true, the component stretches to fill its flex parent height */
  fillHeight?: boolean;
  /** Placeholder when empty */
  placeholder?: string;
  /** Additional class names for display mode */
  className?: string;
  /** Additional styles for display mode */
  style?: React.CSSProperties;
  /** Disable editing */
  disabled?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function EditableText({
  value,
  onChange,
  multiline = false,
  fillHeight = false,
  placeholder = 'Click to edit...',
  className = '',
  style,
  disabled = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      });
    }
  }, [isEditing]);

  const startEditing = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      e.preventDefault();
      setEditValue(value);
      setIsEditing(true);
    },
    [disabled, value],
  );

  const confirmEdit = useCallback(() => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed !== value) {
      onChange(trimmed || value); // Don't allow empty
    }
  }, [editValue, value, onChange]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditValue(value);
  }, [value]);

  // Stop ALL keyboard events from propagating to VS Code
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.stopPropagation();
      // Also stop native event propagation
      e.nativeEvent.stopImmediatePropagation();

      if (e.key === 'Enter' && !multiline) {
        confirmEdit();
      } else if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) {
        confirmEdit();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    },
    [multiline, confirmEdit, cancelEdit],
  );

  const handleKeyUp = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  }, []);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) {
        e.stopPropagation(); // Prevent node drag while editing
      }
    },
    [isEditing],
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.stopPropagation();
  }, []);

  // Edit mode
  if (isEditing) {
    const commonProps = {
      ref: inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>,
      value: editValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setEditValue(e.target.value),
      onBlur: confirmEdit,
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onKeyPress: handleKeyPress,
      onMouseDown: handleMouseDown,
      onInput: handleInput,
      ...getKeyboardBoundaryMetadata({
        scope: 'text-input',
        ownerId: 'editable-text',
        ownedKeys: [
          'Backspace',
          'Delete',
          'Enter',
          'Escape',
          'Space',
          'Tab',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
        ],
      }),
      className: `w-full bg-transparent outline-none border border-[var(--node-selected)] rounded px-1 ${className}`,
      style: { ...style, resize: 'none' as const },
      autoFocus: true,
    };

    if (multiline) {
      // textarea is a replaced element — flex-1 doesn't work on it directly.
      // Wrap in a flex-1 div and stretch textarea via h-full.
      if (fillHeight) {
        return (
          <div className="flex-1 min-h-0 flex flex-col">
            <textarea
              {...commonProps}
              className={`${commonProps.className} flex-1`}
              style={{ ...commonProps.style, height: '100%' }}
            />
          </div>
        );
      }
      return <textarea {...commonProps} rows={3} />;
    }
    return <input type="text" {...commonProps} />;
  }

  // Display mode
  const displayFillCls = fillHeight ? 'flex-1 h-full min-h-0 overflow-auto' : '';
  return (
    <div
      className={`cursor-text ${displayFillCls} ${className}`}
      style={style}
      onDoubleClick={startEditing}
      title={disabled ? undefined : placeholder}
    >
      {value || <span className="opacity-40 italic">{placeholder}</span>}
    </div>
  );
}
