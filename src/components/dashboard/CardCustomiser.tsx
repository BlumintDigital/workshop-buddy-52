import { ArrowDown, ArrowUp, Lock, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { CardId, LayoutEntry } from "@/lib/dashboardCards";

interface CardCustomiserProps {
  layout: LayoutEntry[];
  onVisibleChange: (id: CardId, visible: boolean) => void;
  onMove: (id: CardId, direction: -1 | 1) => void;
  onReset: () => void;
}

/** Show, hide and reorder dashboard cards. Changes apply immediately and are saved per user. */
export function CardCustomiser({ layout, onVisibleChange, onMove, onReset }: CardCustomiserProps) {
  const isMobile = useIsMobile();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal />
          Customise
        </Button>
      </SheetTrigger>
      <SheetContent side={isMobile ? "bottom" : "right"} className="flex max-h-[90svh] flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4 text-left">
          <SheetTitle>Customise your dashboard</SheetTitle>
          <SheetDescription>Choose which cards to show and the order they appear in. Only you see these changes.</SheetDescription>
        </SheetHeader>

        <ul className="flex-1 divide-y overflow-y-auto">
          {layout.map((entry, index) => {
            const { meta } = entry;
            const switchId = `card-toggle-${meta.id}`;
            return (
              <li key={meta.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor={switchId} className="text-sm font-medium">
                    {meta.title}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {meta.required ? "Always shown" : meta.description}
                  </p>
                </div>
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={`Move ${meta.title} up`}
                    disabled={index === 0}
                    onClick={() => onMove(meta.id, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label={`Move ${meta.title} down`}
                    disabled={index === layout.length - 1}
                    onClick={() => onMove(meta.id, 1)}
                  >
                    <ArrowDown />
                  </Button>
                </div>
                {meta.required ? (
                  <Lock className="mx-2.5 h-4 w-4 text-muted-foreground" aria-label="Required" />
                ) : (
                  <Switch
                    id={switchId}
                    checked={entry.visible}
                    onCheckedChange={(checked) => onVisibleChange(meta.id, checked)}
                  />
                )}
              </li>
            );
          })}
        </ul>

        <SheetFooter className="border-t p-4">
          <Button variant="ghost" onClick={onReset}>
            Reset to default
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
