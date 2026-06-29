import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function usePendingRequestCount() {
  const { role, user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user || (role !== "admin" && role !== "manager")) return;
    let cancelled = false;

    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("client_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      if (!cancelled) setCount(c || 0);
    };
    fetchCount();

    const channel = supabase
      .channel("pending-requests-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "client_requests" },
        () => fetchCount(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  return count;
}
