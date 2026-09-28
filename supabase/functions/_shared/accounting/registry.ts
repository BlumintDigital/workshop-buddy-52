// Every finance system Shoplane can connect to. To add one, implement
// AccountingProvider in its own file, import it here, and add its id to the
// accounting_connections check constraint in a migration.

import type { AccountingProvider, ProviderId } from "./types.ts";
import { quickbooks } from "./quickbooks.ts";
import { xero } from "./xero.ts";
import { webhook } from "./webhook.ts";
import { test } from "./test.ts";

export const PROVIDERS: Record<ProviderId, AccountingProvider> = { quickbooks, xero, webhook, test };

export function getProvider(id: string): AccountingProvider {
  const p = PROVIDERS[id as ProviderId];
  if (!p) throw new Error(`Unknown accounting system: ${id}`);
  return p;
}
