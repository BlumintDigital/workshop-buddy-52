import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { InvoiceDiscount } from "@/lib/invoiceTotals";

/** One discount for the whole invoice: none, a percentage, or a fixed amount, with a reason. */
export function DiscountField({ value, onChange, currency }: { value: InvoiceDiscount; onChange: (d: InvoiceDiscount) => void; currency: string }) {
  const kind = value.type ?? "none";
  return (
    <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_8rem_1fr]">
      <legend className="sr-only">Discount</legend>
      <div>
        <Label htmlFor="f-discount-type">Discount</Label>
        <Select value={kind} onValueChange={(v) => onChange({ ...value, type: v === "none" ? null : (v as InvoiceDiscount["type"]), value: v === "none" ? 0 : value.value })}>
          <SelectTrigger id="f-discount-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No discount</SelectItem>
            <SelectItem value="percent">Percentage</SelectItem>
            <SelectItem value="amount">Fixed amount</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.type && (
        <>
          <div>
            <Label htmlFor="f-discount-value">{value.type === "percent" ? "Percent" : `Amount (${currency})`}</Label>
            <Input
              id="f-discount-value"
              type="number"
              min={0}
              max={value.type === "percent" ? 100 : undefined}
              step={value.type === "percent" ? 0.5 : 0.01}
              value={value.value || ""}
              onChange={(e) => onChange({ ...value, value: Math.max(0, Number(e.target.value)) })}
            />
          </div>
          <div>
            <Label htmlFor="f-discount-reason">Reason</Label>
            <Input
              id="f-discount-reason"
              value={value.reason ?? ""}
              onChange={(e) => onChange({ ...value, reason: e.target.value })}
              placeholder="e.g. Loyalty discount, agreed on the phone"
              maxLength={200}
            />
          </div>
        </>
      )}
    </fieldset>
  );
}
