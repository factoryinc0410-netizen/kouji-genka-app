export type Branded<T, Brand extends string> = T & { readonly __brand: Brand };

export type Uuid = Branded<string, 'Uuid'>;
export type UserId = Branded<string, 'UserId'>;
export type ProjectId = Branded<string, 'ProjectId'>;
export type BudgetHeaderId = Branded<string, 'BudgetHeaderId'>;
export type BudgetItemId = Branded<string, 'BudgetItemId'>;

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
