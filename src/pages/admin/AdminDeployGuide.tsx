import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import pdfAsset from "../../../public/docs/deploy-new-customer.pdf.asset.json";

const PDF_URL = pdfAsset.url;

export default function AdminDeployGuide() {
  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Deploy Guide</h1>
        <p className="text-muted-foreground">
          Step-by-step instructions for deploying Workshop Buddy for a new customer instance.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            New Customer Deployment Guide
          </CardTitle>
          <CardDescription>
            Download the full professionally formatted PDF version of the deployment guide.
          </CardDescription>
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
          <CardDescription>Inline preview of the PDF guide.</CardDescription>
        </CardHeader>
        <CardContent>
          <iframe
            src={PDF_URL}
            title="Deploy New Customer Guide"
            className="h-[80vh] w-full rounded-md border"
          />
        </CardContent>
      </Card>
    </div>
  );
}
