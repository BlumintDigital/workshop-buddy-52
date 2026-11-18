import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { HandoverPayment } from "@/lib/billing";

const OPTIONS: { value: HandoverPayment; label: string; description: string }[] = [
  { value: "off", label: "Off", description: "No check. Shipping still sees whether it's paid." },
  { value: "warn", label: "Warn", description: "Shipping must say why it's leaving unpaid. No reason is needed if the client says they've paid." },
  { value: "block", label: "Block", description: "It can't leave until the payment is confirmed. An admin can let it go if they say why." },
];

/** Settings, Billing tab: whether a machine can be handed over before it's paid for. */
export default function HandoverPaymentSetting() {
  const [value, setValue] = useState<HandoverPayment | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase
      .from("workshop_settings")
      .select("handover_payment")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => setValue((data?.handover_payment as HandoverPayment | undefined) ?? "warn"));
  }, []);

  const choose = async (next: HandoverPayment) => {
    if (next === value || saving) return;
    const before = value;
    setValue(next);
    setSaving(true);
    const { error } = await supabase.from("workshop_settings").update({ handover_payment: next }).eq("id", 1);
    setSaving(false);
    if (error) {
      setValue(before);
      return toast.error(error.message);
    }
    toast.success(`Payment before hand-over: ${OPTIONS.find((o) => o.value === next)?.label}`);
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Payment before hand-over</CardTitle>
        <CardDescription>What Shipping must do when a project is ready to leave but hasn't been paid for.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Payment before hand-over" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              disabled={value === null || saving}
              onClick={() => void choose(o.value)}
              className={cn("rounded-lg border p-3 text-left disabled:opacity-60", value === o.value ? "border-primary bg-primary-soft" : "border-input bg-card hover:bg-secondary")}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                {value === o.value && <Check className="h-4 w-4 text-primary" aria-hidden />}
                {o.label}
                {o.value === "warn" && <span className="font-normal text-muted-foreground"> (default)</span>}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{o.description}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
