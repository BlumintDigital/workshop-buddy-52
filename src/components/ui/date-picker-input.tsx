import { useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";

interface DatePickerInputProps {
  value: string; // yyyy-MM-dd or ""
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function DatePickerInput({ value, onChange, placeholder = "Pick a date", className, disabled }: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date | undefined>(value ? parseISO(value) : new Date());

  const displayValue = value ? format(parseISO(value), "MMMM dd, yyyy") : "";

  return (
    <InputGroup className={className}>
      <InputGroupInput
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        readOnly
        onClick={() => !disabled && setOpen(true)}
        className="cursor-pointer"
      />
      <InputGroupAddon align="inline-end">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <InputGroupButton variant="ghost" size="icon" aria-label="Select date" disabled={disabled}>
              <CalendarIcon className="h-4 w-4" />
            </InputGroupButton>
          </PopoverTrigger>
          <PopoverContent className="w-auto overflow-hidden p-0" align="end" alignOffset={-8} sideOffset={10}>
            <Calendar
              mode="single"
              selected={value ? parseISO(value) : undefined}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                onChange(date ? format(date, "yyyy-MM-dd") : "");
                setOpen(false);
              }}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </InputGroupAddon>
    </InputGroup>
  );
}
