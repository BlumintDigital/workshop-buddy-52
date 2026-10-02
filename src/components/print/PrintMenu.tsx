import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Print a project's A4 job card or its QR label. Each opens in a new tab with the print dialog. */
export function PrintMenu({ projectId }: { projectId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm"><Printer className="mr-1.5 h-4 w-4" aria-hidden />Print</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild className="min-h-[40px]">
          <a href={`/print/job-card/${projectId}`} target="_blank" rel="noopener">Job card (A4)</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-[40px]">
          <a href={`/print/project-label/${projectId}`} target="_blank" rel="noopener">QR label (62 mm)</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
