/**
 * 業務向け表示・入力ヘルパ。
 * - 金額: API は string (numeric(15,0)) を授受。number に丸めると 15 桁で桁落ちするため、
 *   表示時のみ Intl.NumberFormat に通し、それ以外は文字列のまま運ぶ。
 */

const AMOUNT_FORMATTER = new Intl.NumberFormat('ja-JP');

/** "250000000" → "250,000,000"。空文字や数字以外を含むものはそのまま返す */
export function formatAmount(value: string | null | undefined): string {
  if (value == null || value === '') return '';
  if (!/^\d+$/.test(value)) return value;
  // 15 桁までは BigInt 安全
  return AMOUNT_FORMATTER.format(BigInt(value));
}

/** 入力中の文字列をプレーン数字 (連続する数字のみ) に正規化する */
export function sanitizeAmountInput(raw: string): string {
  return raw.replace(/[^\d]/g, '');
}

/** 入力中の見た目を「カンマ区切り」にする (入力フィールドの value 用) */
export function formatAmountForInput(raw: string): string {
  const plain = sanitizeAmountInput(raw);
  return plain === '' ? '' : AMOUNT_FORMATTER.format(BigInt(plain));
}
