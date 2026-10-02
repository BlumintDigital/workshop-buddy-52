import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decodeVin, lookupVehicle, useLookupStatus, type VehicleLookup, type VinLookup } from "@/lib/lookup";

/** "Look up" beside a registration: fetches the vehicle's details (UK). Hidden when not set up. */
export function VehicleLookupButton({ registration, onFound }: { registration: string; onFound: (v: VehicleLookup) => void }) {
  const { data: status } = useLookupStatus();
  const [busy, setBusy] = useState(false);
  if (!status?.vehicle) return null;
  const run = async () => {
    if (registration.replace(/\s+/g, "").length < 2) return toast.error("Type the registration first");
    setBusy(true);
    try {
      const v = await lookupVehicle(registration);
      if (!v) toast.error(`No vehicle found for ${registration.toUpperCase()}. Check the registration, or enter the details by hand.`);
      else onFound(v);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="outline" onClick={run} disabled={busy} className="shrink-0">
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-1.5 h-4 w-4" aria-hidden />}
      Look up
    </Button>
  );
}

/** "Decode" beside a VIN: fills make, model and year (best for US and Canadian vehicles). */
export function VinDecodeButton({ vin, onFound }: { vin: string; onFound: (v: VinLookup) => void }) {
  const { data: status } = useLookupStatus();
  const [busy, setBusy] = useState(false);
  if (!status?.vin) return null;
  const run = async () => {
    if (vin.replace(/\s+/g, "").length !== 17) return toast.error("A VIN is 17 letters and numbers");
    setBusy(true);
    try {
      const v = await decodeVin(vin);
      if (!v) toast.error("That VIN couldn't be decoded. Enter the details by hand.");
      else onFound(v);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button type="button" variant="outline" onClick={run} disabled={busy} className="shrink-0">
      {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Search className="mr-1.5 h-4 w-4" aria-hidden />}
      Decode
    </Button>
  );
}
