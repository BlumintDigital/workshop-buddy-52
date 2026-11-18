import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** Settings, General tab: when timers left running on My day pause themselves. */
export default function TimerClosingTimeSetting() {
  const [loaded, setLoaded] = useState(false);
  const [on, setOn] = useState(true);
  const [time, setTime] = useState("18:00");
  const [saved, setSaved] = useState<string | null>("18:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase
      .from("workshop_settings")
      .select("timer_closing_time")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        const v = data?.timer_closing_time ? data.timer_closing_time.slice(0, 5) : null;
        setSaved(v);
        setOn(v !== null);
        if (v) setTime(v);
        setLoaded(true);
      });
  }, []);

  const save = async (next: string | null) => {
    setSaving(true);
    const { error } = await supabase.from("workshop_settings").update({ timer_closing_time: next }).eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    setSaved(next);
    toast.success(next ? `Timers now pause at ${next}` : "Timers no longer pause at closing time");
  };

  const toggle = (v: boolean) => {
    setOn(v);
    void save(v ? time : null);
  };

  return (
    <Card className="mt-4 max-w-3xl">
      <CardHeader>
        <CardTitle>Closing time for timers</CardTitle>
        <CardDescription>
          A timer still running on My day after closing time is paused for the person, and only the time up to closing is logged. They see a note about it the next time they open My day.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-4">
        <div className="flex items-center gap-2">
          <Switch id="timer-close-on" checked={on} disabled={!loaded || saving} onCheckedChange={toggle} />
          <Label htmlFor="timer-close-on">Pause timers at closing time</Label>
        </div>
        {on && (
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="timer-close-time">Closing time</Label>
              <Input id="timer-close-time" type="time" className="w-32" value={time} disabled={!loaded || saving} onChange={(e) => setTime(e.target.value)} />
            </div>
            <Button variant="outline" disabled={!loaded || saving || !time || time === saved} onClick={() => void save(time)}>
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
