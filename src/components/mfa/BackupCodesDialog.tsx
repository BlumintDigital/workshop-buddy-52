import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  codes: string[];
  onClose: () => void;
}

export default function BackupCodesDialog({ open, codes, onClose }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  const copyAll = async () => {
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Codes copied to clipboard");
  };

  const download = () => {
    const content = `Backup codes — keep these safe.\nEach code can be used once.\n\n${codes.join("\n")}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setAcknowledged(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && acknowledged && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Your backup codes
          </DialogTitle>
          <DialogDescription>
            Save these codes somewhere safe. Each one can be used once to sign in if you lose your authenticator. You will not see them again.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-3 font-mono text-sm">
          {codes.map((c) => (
            <div key={c} className="text-center tracking-wider">{c}</div>
          ))}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyAll} className="flex-1">
            <Copy className="mr-1 h-4 w-4" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={download} className="flex-1">
            <Download className="mr-1 h-4 w-4" /> Download
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(!!v)} />
          I have saved these codes
        </label>

        <DialogFooter>
          <Button onClick={handleClose} disabled={!acknowledged}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
