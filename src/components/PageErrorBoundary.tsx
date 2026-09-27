import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { ErrorScreen } from "@/components/ErrorScreen";
import { reloadOnceForStaleBuild } from "@/lib/errors";

interface Props {
  children: ReactNode;
  variant: "page" | "full";
}

/**
 * Catches a crash so the person gets a way forward instead of a blank screen.
 * At page level the sidebar and header stay usable; give it a key (the path)
 * so moving to another page clears the error.
 */
export class PageErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (reloadOnceForStaleBuild(error)) return;
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} variant={this.props.variant} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}
