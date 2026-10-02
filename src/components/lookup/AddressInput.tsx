import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatAddress, searchAddress, useLookupStatus, useWorkshopCountry, type AddressSuggestion } from "@/lib/lookup";

const UK_POSTCODE_AT_END = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i;

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Show a textarea instead of a one-line input. */
  rows?: number;
  maxLength?: number;
}

/**
 * An address field that suggests addresses as you type. With worldwide search set up (Geoapify)
 * it suggests full addresses; without it, a UK postcode at the end fills in the town and county
 * (postcodes.io). Anything can still be typed by hand, and nothing shows if lookups aren't available.
 */
export function AddressInput({ id, value, onChange, placeholder, className, rows, maxLength = 500 }: Props) {
  const { data: status } = useLookupStatus();
  const country = useWorkshopCountry();
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = useRef(false);
  const listId = useId();

  const worldwide = !!status?.address_search;
  const postcodeOnly = !worldwide && !!status?.uk_postcode;
  const postcodeMatch = postcodeOnly ? value.match(UK_POSTCODE_AT_END) : null;
  const query = worldwide ? value.trim() : postcodeMatch?.[1] ?? "";

  useEffect(() => {
    if (!typed.current || query.length < (worldwide ? 4 : 5)) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      searchAddress(query, country)
        .then((r) => {
          if (cancelled) return;
          // In postcode mode, don't offer to fill in what's already there.
          const fresh = postcodeOnly ? r.filter((a) => !value.toLowerCase().includes(a.city.toLowerCase())) : r;
          setResults(fresh);
          setActive(0);
          setOpen(fresh.length > 0);
        })
        .catch(() => !cancelled && setResults([]));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // value is read only for the postcode-mode filter; query already tracks what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, country, worldwide, postcodeOnly]);

  const pick = (a: AddressSuggestion) => {
    const before = postcodeMatch ? value.slice(0, postcodeMatch.index).trim().replace(/,$/, "") : "";
    onChange(formatAddress(a, postcodeOnly ? "gb" : country, before));
    typed.current = false;
    setOpen(false);
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  const shared = {
    id,
    value,
    maxLength,
    placeholder: placeholder ?? (worldwide ? "Start typing an address" : postcodeOnly ? "Street, then the postcode to fill in the town" : undefined),
    autoComplete: "off",
    role: "combobox",
    "aria-expanded": open,
    "aria-controls": listId,
    "aria-autocomplete": "list" as const,
    "aria-activedescendant": open ? `${listId}-${active}` : undefined,
    onKeyDown,
    onBlur: () => setTimeout(() => setOpen(false), 150),
    onFocus: () => results.length && setOpen(true),
  };
  const change = (v: string) => {
    typed.current = true;
    onChange(v);
  };

  return (
    <div className={cn("relative", className)}>
      {rows ? (
        <Textarea {...shared} rows={rows} onChange={(e) => change(e.target.value)} />
      ) : (
        <Input {...shared} onChange={(e) => change(e.target.value)} />
      )}
      {open && (
        <ul id={listId} role="listbox" aria-label="Address suggestions" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-sm shadow-md">
          {results.map((a, i) => (
            <li
              key={`${a.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(a); }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex min-h-[40px] cursor-pointer items-start gap-2 rounded px-2 py-2", i === active && "bg-accent text-accent-foreground")}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>{postcodeOnly ? `Fill in ${a.label}` : a.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
