// The modules an admin can grant to a person or a team. Checked in the database
// (has_permission) as well as here, so hiding a menu is never the only guard.

export const PERMISSIONS = [
  { key: "reception", label: "Reception", description: "Log machines as they arrive and handle client requests." },
  { key: "planning", label: "Project planning", description: "Split projects into team tasks, assign people and request parts." },
  { key: "quality", label: "Quality check", description: "Check finished work and release it to shipping." },
  { key: "inventory", label: "Inventory", description: "Stock, parts requests, suppliers and purchase orders." },
  { key: "inventory_approve", label: "Approve purchases", description: "Approve purchase orders. Managers can approve up to the limit set in Settings." },
  { key: "shipping", label: "Shipping", description: "Tell clients items are ready, record collections and courier shipments." },
  { key: "reports", label: "Reports and costs", description: "Reports, project profit and loss, and labour rates." },
  { key: "billing", label: "Billing", description: "Create and send invoices." },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_LABEL: Record<Permission, string> = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.label])) as Record<Permission, string>;
