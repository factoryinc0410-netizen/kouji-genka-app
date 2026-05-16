import type { BudgetItem } from '@kgk/schemas';

/**
 * API のフラット配列 (level → display_order 順で返ってくる) を、
 * parent_id を辿ってネスト構造に組み立てる。
 *
 * - children は parent の display_order 順
 * - 葉ノード (kind=detail) でも children は [] にしておく (TanStack Table の
 *   getSubRows は undefined と [] を別物として扱うため、空配列で統一)
 */
export interface BudgetItemNode extends BudgetItem {
  children: BudgetItemNode[];
}

export function buildBudgetTree(items: ReadonlyArray<BudgetItem>): BudgetItemNode[] {
  // すべての item をノード化 (children: [])
  const nodes = new Map<string, BudgetItemNode>();
  for (const item of items) {
    nodes.set(item.id, { ...item, children: [] });
  }

  // 親に紐付け
  const roots: BudgetItemNode[] = [];
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      const parent = nodes.get(node.parentId);
      if (parent) parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // 同一階層は display_order 昇順
  const sortAsc = (a: BudgetItemNode, b: BudgetItemNode): number => a.displayOrder - b.displayOrder;
  roots.sort(sortAsc);
  for (const node of nodes.values()) node.children.sort(sortAsc);

  return roots;
}
