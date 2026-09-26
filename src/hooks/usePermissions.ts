import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Permission } from "@/lib/permissions";

/**
 * What the signed-in person may do beyond their base role, resolved by the
 * database from their teams and direct grants. Admins hold everything;
 * managers keep what their role already covered; clients hold nothing.
 */
export function usePermissions() {
  const { user, role } = useAuth();
  const query = useQuery({
    queryKey: ["my-permissions", user?.id],
    enabled: !!user && !!role && role !== "client",
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_permissions");
      if (error) throw error;
      return (data ?? []) as Permission[];
    },
  });
  const list = query.data ?? [];
  return {
    permissions: list,
    loading: query.isLoading && !!user && role !== "client",
    has: (p: Permission) => role === "admin" || list.includes(p),
    refresh: () => query.refetch(),
  };
}
