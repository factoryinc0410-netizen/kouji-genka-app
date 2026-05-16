'use client';

import {
  cloneElement,
  type MouseEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';

/**
 * 依存ゼロの最小 DropdownMenu。
 * - trigger を render し、クリックで items パネルを開閉
 * - 外側クリック / Esc で閉じる
 * - shadcn 互換の意図はなく、業務 UI で「⋮」ボタン → メニュー を実現するための最小実装
 *
 * 例:
 *   <DropdownMenu trigger={<button>⋮</button>}>
 *     {(close) => (
 *       <>
 *         <DropdownItem onClick={() => { close(); doX(); }}>X</DropdownItem>
 *         <DropdownItem disabled>無効</DropdownItem>
 *       </>
 *     )}
 *   </DropdownMenu>
 */

interface Props {
  /**
   * クリックでメニューを開閉する trigger 要素。button などのインタラクティブ要素を渡す前提。
   * 内部で cloneElement して onClick を合成する。
   */
  trigger: ReactElement<{ onClick?: (e: MouseEvent) => void }>;
  children: (close: () => void) => React.ReactNode;
  /** メニューパネルの揃え (right=trigger右端揃え、left=trigger左端揃え) */
  align?: 'left' | 'right';
}

export function DropdownMenu({ trigger, children, align = 'right' }: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: globalThis.MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const originalOnClick = trigger.props.onClick;
  const triggerEl = cloneElement(trigger, {
    onClick: (e: MouseEvent) => {
      originalOnClick?.(e);
      setOpen((p) => !p);
    },
  });

  return (
    <div ref={wrapRef} className="relative inline-block">
      {triggerEl}
      {open ? (
        <div
          role="menu"
          className={
            'absolute z-30 mt-1 min-w-[160px] overflow-hidden rounded-md border bg-popover p-1 text-sm shadow-md ' +
            (align === 'right' ? 'right-0' : 'left-0')
          }
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function DropdownItem({
  onClick,
  disabled,
  destructive,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={
        'flex w-full items-center rounded-sm px-2 py-1.5 text-left ' +
        (disabled
          ? 'cursor-not-allowed text-muted-foreground opacity-60'
          : destructive
            ? 'cursor-pointer text-destructive hover:bg-destructive/10'
            : 'cursor-pointer hover:bg-muted')
      }
    >
      {children}
    </button>
  );
}

export function DropdownSeparator(): React.ReactElement {
  return <div className="my-1 h-px bg-border" />;
}
