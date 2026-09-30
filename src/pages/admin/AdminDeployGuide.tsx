import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Built from docs/deploy-new-customer.md with `npm run docs:deploy-pdf`.
const PDF_URL = "/docs/deploy-new-customer.pdf";

export default function AdminDeployGuide() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Deploy guide</h1>
        <p className="text-muted-foreground">
          How to set up Shoplane for a new customer with Shoplane Control, written for someone on their first day.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Setting up a new Shoplane customer
          </CardTitle>
          <CardDescription>The full guide as a PDF.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline">
            <a href={PDF_URL} target="_blank" rel="noopener noreferrer">
              Open in new tab
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <iframe src={PDF_URL} title="Setting up a new Shoplane customer" className="h-[80vh] w-full rounded-md border" />
        </CardContent>
      </Card>
    </div>
  );
}
