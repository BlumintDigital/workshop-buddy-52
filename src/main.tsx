import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import "./index.css";
import "@fontsource-variable/archivo/wdth.css";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Strip PII from error reports
    beforeSend(event) {
      if (event.user) delete event.user.email;
      return event;
    },
  });
}

// Last line of defence: if the whole app crashes, show a way forward instead of
// a blank page. Individual pages have their own boundary inside the shell.
createRoot(document.getElementById("root")!).render(
  <PageErrorBoundary variant="full">
    <App />
  </PageErrorBoundary>,
);
