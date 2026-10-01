import type { WorkshopDetails } from "@/lib/invoicePdf";
import { useWorkshopSettings } from "@/hooks/useWorkshopSettings";

/**
 * Company details for invoices and PDF previews. Reads the shared settings, so an admin's edit
 * to name, address, phone, email or logo reaches every consumer live.
 */
export function useWorkshopDetails() {
  const { data, isLoading } = useWorkshopSettings();
  const workshop: WorkshopDetails | undefined = data
    ? {
        workshop_name: data.workshop_name,
        address: data.address,
        phone: data.phone,
        contact_email: data.contact_email,
        logo_url: data.logo_url,
      }
    : undefined;
  return { workshop, currency: data?.currency || "USD", loading: isLoading };
}
