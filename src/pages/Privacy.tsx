import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" asChild className="mb-8 -ml-2 gap-2">
          <Link to="/auth"><ArrowLeft className="h-4 w-4" />Back</Link>
        </Button>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. Who we are</h2>
            <p className="text-muted-foreground">
              Workshop Manager is operated by Blumint Digital Limited ("we", "our", "us"), accessible at{" "}
              <a href="https://www.shoplane.uk" className="underline">www.shoplane.uk</a>.
              This policy explains what personal data we collect, why we collect it, and your rights.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Data we collect</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Account data:</strong> name, email address, phone number, and password (hashed — never stored in plaintext)</li>
              <li><strong>Business data:</strong> jobs, invoices, appointments, inventory, and notes you create in the platform</li>
              <li><strong>Usage data:</strong> login times, IP addresses, and actions performed (stored in an audit log for security purposes)</li>
              <li><strong>Device data:</strong> browser type and operating system, collected when you use multi-factor authentication device trust</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Legal basis for processing</h2>
            <p className="text-muted-foreground">
              We process your data under the following lawful bases (UK GDPR Article 6):
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
              <li><strong>Contract:</strong> to provide the Workshop Manager service you have signed up for</li>
              <li><strong>Legitimate interests:</strong> to maintain security, prevent fraud, and audit access</li>
              <li><strong>Legal obligation:</strong> to retain financial records for 7 years as required by UK HMRC</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. Data retention</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Account and profile data:</strong> retained while your account is active; deleted within 30 days of account closure on request</li>
              <li><strong>Invoices and financial records:</strong> 7 years from the date of the transaction (UK HMRC requirement)</li>
              <li><strong>Audit logs (activity_logs):</strong> 2 years</li>
              <li><strong>Emails sent via the platform:</strong> not stored; processed by Resend in real-time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Third-party processors</h2>
            <p className="text-muted-foreground">
              We use a small number of trusted sub-processors to host the application, store data,
              and deliver transactional emails. All processors are bound by data-processing
              agreements and process data only as instructed by us. A current list is available on
              request.
            </p>
          </section>


          <section>
            <h2 className="text-xl font-semibold mb-3">6. Your rights</h2>
            <p className="text-muted-foreground mb-2">Under UK GDPR you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Access</strong> a copy of the data we hold about you</li>
              <li><strong>Rectification</strong> — correct inaccurate data (you can update most data yourself in your profile)</li>
              <li><strong>Erasure</strong> — request deletion of your account and non-financial data</li>
              <li><strong>Portability</strong> — receive your data in a machine-readable format</li>
              <li><strong>Object</strong> to processing based on legitimate interests</li>
              <li><strong>Restriction</strong> of processing while a complaint is resolved</li>
            </ul>
            <p className="text-muted-foreground mt-3">
              To exercise any right, email{" "}
              <a href="mailto:privacy@blumintdigital.uk" className="underline">privacy@blumintdigital.uk</a>.
              We respond within 30 days. You also have the right to lodge a complaint with the{" "}
              <a href="https://ico.org.uk" className="underline" target="_blank" rel="noopener">ICO</a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Security</h2>
            <p className="text-muted-foreground">
              All data is encrypted in transit (TLS 1.2+) and at rest (AES-256). Access is controlled by
              row-level security policies. Authentication supports multi-factor authentication via TOTP.
              We maintain an immutable audit log of all data access and changes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
            <p className="text-muted-foreground">
              Data controller: Blumint Digital Limited<br />
              Email: <a href="mailto:privacy@blumintdigital.uk" className="underline">privacy@blumintdigital.uk</a><br />
              Security issues: <a href="mailto:platform@blumintdigital.uk" className="underline">platform@blumintdigital.uk</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
