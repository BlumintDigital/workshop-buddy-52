import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LiveTable = { table: string; filter?: string };

/**
 * Refetches a cached query whenever a row changes in one of `tables`. Realtime applies each
 * table's row rules, so a page only hears about rows it can already read.
 */
export function useRealtimeRefresh(channel: string | null, tables: LiveTable[], queryKey: QueryKey) {
  const queryClient = useQueryClient();
  const tablesKey = JSON.stringify(tables);
  const key = JSON.stringify(queryKey);

  useEffect(() => {
    if (!channel) return;
    const refresh = () => void queryClient.invalidateQueries({ queryKey: JSON.parse(key) as QueryKey });
    let ch = supabase.channel(channel);
    for (const t of JSON.parse(tablesKey) as LiveTable[]) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) }, refresh);
    }
    ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [channel, tablesKey, key, queryClient]);
}
