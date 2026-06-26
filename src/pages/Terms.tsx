import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Button variant="ghost" asChild className="mb-8 -ml-2 gap-2">
          <Link to="/auth"><ArrowLeft className="h-4 w-4" />Back</Link>
        </Button>

        <h1 className="text-3xl font-bold tracking-tight mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-muted-foreground">

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">1. Acceptance</h2>
            <p>
              By accessing or using Workshop Manager ("the Service"), you agree to be bound by these Terms.
              If you are using the Service on behalf of an organisation, you represent that you have authority
              to bind that organisation to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">2. Description of service</h2>
            <p>
              Workshop Manager is a business management platform for automotive and trade workshops.
              It provides tools for managing jobs, invoices, appointments, inventory, and staff.
              The Service is provided "as is" and features may change at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">3. Account responsibilities</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You are responsible for maintaining the confidentiality of your login credentials</li>
              <li>You must notify us immediately of any unauthorised access to your account</li>
              <li>You must not share your account with others or allow multiple concurrent sessions under one account</li>
              <li>Accounts are non-transferable</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Acceptable use</h2>
            <p className="mb-2">You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure</li>
              <li>Upload malicious code, viruses, or any content intended to disrupt the Service</li>
              <li>Reverse engineer, decompile, or attempt to extract source code from the Service</li>
              <li>Resell or sublicense access to the Service without our written consent</li>
              <li>Use the Service to store or process sensitive personal data beyond the scope of normal workshop management (e.g. health records, payment card data)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">5. Data and privacy</h2>
            <p>
              Our collection and use of your data is governed by our{" "}
              <Link to="/privacy" className="underline text-foreground">Privacy Policy</Link>, which is
              incorporated into these Terms by reference. By using the Service, you consent to the
              data practices described in that policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">6. Intellectual property</h2>
            <p>
              The Service and its original content, features, and functionality are owned by Blumint Digital Limited
              and are protected by copyright, trademark, and other intellectual property laws.
              You retain ownership of all data you input into the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">7. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Blumint Digital Limited shall not be liable for
              any indirect, incidental, special, consequential, or punitive damages, including loss of
              profits, data, or business goodwill, arising from your use of or inability to use the Service.
              Our total liability to you shall not exceed the amounts paid by you (if any) in the 12 months
              preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">8. Availability and changes</h2>
            <p>
              We do not guarantee uninterrupted availability of the Service. We reserve the right to
              modify, suspend, or discontinue any part of the Service at any time, with reasonable notice
              where practicable. We may update these Terms from time to time; continued use after changes
              take effect constitutes acceptance.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">9. Termination</h2>
            <p>
              We may suspend or terminate your access to the Service immediately, without prior notice,
              if you violate these Terms. Upon termination, your right to use the Service ceases immediately.
              You may request export of your data within 30 days of termination.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">10. Governing law</h2>
            <p>
              These Terms are governed by the laws of England and Wales. Any disputes shall be subject
              to the exclusive jurisdiction of the courts of England and Wales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mb-3">11. Contact</h2>
            <p>
              Blumint Digital Limited<br />
              Email: <a href="mailto:legal@shoplane.uk" className="underline text-foreground">legal@shoplane.uk</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
