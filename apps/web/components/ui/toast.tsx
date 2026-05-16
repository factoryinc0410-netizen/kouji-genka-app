'use client';

/**
 * 最小限の Toast (依存ゼロ)。
 * - showToast({ kind, title, description, actionLabel, onAction }) で表示
 * - 5 秒で自動的に消える。action は手動操作 (リロード等) に使う
 * - shadcn の Toaster と置き換える前提のシンプル実装 (MVP)
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ToastKind = 'info' | 'success' | 'warning' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  show: (t: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((t: Omit<ToastItem, 'id'>) => {
    setItems((prev) => [...prev, { ...t, id: Date.now() + Math.random() }]);
  }, []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <ToastRack items={items} onDismiss={(id) => setItems((p) => p.filter((x) => x.id !== id))} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

function ToastRack({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: number) => void;
}): React.ReactElement {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-96 max-w-[90vw] flex-col gap-2">
      {items.map((t) => (
        <ToastView key={t.id} item={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}): React.ReactElement {
  useEffect(() => {
    const handle = setTimeout(() => onDismiss(item.id), 5000);
    return () => clearTimeout(handle);
  }, [item.id, onDismiss]);

  const colors: Record<ToastKind, string> = {
    info: 'border-border bg-card text-foreground',
    success:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
    warning: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
    error: 'border-destructive bg-destructive/10 text-destructive',
  };

  return (
    <div
      role={item.kind === 'error' || item.kind === 'warning' ? 'alert' : 'status'}
      className={`pointer-events-auto rounded-md border px-3 py-2 text-sm shadow-md ${colors[item.kind]}`}
    >
      <div className="font-medium">{item.title}</div>
      {item.description ? (
        <div className="mt-0.5 text-xs opacity-80">{item.description}</div>
      ) : null}
      {item.actionLabel && item.onAction ? (
        <button
          type="button"
          onClick={() => {
            item.onAction?.();
            onDismiss(item.id);
          }}
          className="mt-2 inline-flex h-7 items-center rounded-md border border-current bg-transparent px-2 text-xs font-medium hover:opacity-80"
        >
          {item.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
