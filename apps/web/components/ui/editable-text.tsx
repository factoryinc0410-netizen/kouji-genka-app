'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 汎用 click-to-edit テキストセル / フィールド。
 *
 * - 通常表示: テキスト + hover ハイライト (空値なら emptyDisplay をプレースホルダ)
 * - クリック: <input> に切替、useEffect で focus + select (autoFocus 属性は a11y 警告のため使わない)
 * - Blur / Enter: 値を trim → 変化があれば onCommit、変化なしならそのまま閉じる
 * - Esc: 編集破棄
 * - required: 空 (trim 後 '') は無視して元の値に戻す
 * - 空文字は **null** として送信するので、Schema 側 `.nullable().optional()` に合う
 *
 * Budget 明細セル (table cell) と Budget ヘッダ (h1 横のタイトル) で共用する想定。
 */
export function EditableText({
  value,
  required,
  maxLength,
  emptyDisplay = '—',
  className,
  inputClassName,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: string | null;
  required?: boolean;
  maxLength: number;
  emptyDisplay?: string;
  /** 表示・入力両モードに当てる追加クラス (フォントサイズ等を揃える) */
  className?: string;
  /** 編集中 input のみに当てる追加クラス (高さ / 余白を上書きしたい時) */
  inputClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onCommit: (next: string | null) => Promise<void> | void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 親から value が更新されたら draft を同期 (編集中/送信中でない場合に限る)
  if (!editing && !pending && draft !== (value ?? '')) {
    setDraft(value ?? '');
  }

  // 編集モード開始直後にフォーカス + 全選択
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          setDraft(value ?? '');
          setEditing(true);
        }}
        className={
          'w-full rounded-sm px-1 py-0.5 text-left ' +
          (disabled
            ? 'cursor-default'
            : 'cursor-text hover:bg-muted/50 focus:bg-muted/50 focus:outline-none') +
          (className ? ` ${className}` : '')
        }
      >
        {value ? value : <span className="text-muted-foreground/60 italic">{emptyDisplay}</span>}
      </button>
    );
  }

  const commit = async (): Promise<void> => {
    const trimmed = draft.trim();
    if (required && trimmed === '') {
      // 必須フィールドが空 → 編集破棄
      setDraft(value ?? '');
      setEditing(false);
      return;
    }
    const normalized = trimmed === '' ? null : trimmed;
    if ((normalized ?? '') === (value ?? '')) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      await onCommit(normalized);
    } finally {
      setPending(false);
      setEditing(false);
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(value ?? '');
          setEditing(false);
        }
      }}
      disabled={pending}
      className={
        'h-7 w-full rounded-sm border border-input bg-background px-1 outline-none focus:ring-1 focus:ring-input ' +
        (className ? `${className} ` : '') +
        (inputClassName ?? '')
      }
    />
  );
}
