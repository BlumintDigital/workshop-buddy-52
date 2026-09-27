import { useTheme } from "next-themes";
import { CircleAlert, CircleCheck, Info, Loader2, TriangleAlert } from "lucide-react";
import { Toaster as Sonner, toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Errors usually need reading (and sometimes acting on), so they stay longer
// than confirmations. Every call site imports toast from "sonner", so the
// default is set once here rather than at each call.
const ERROR_DURATION = 8000;
const showError = toast.error;
toast.error = ((message, data) => showError(message, { duration: ERROR_DURATION, ...data })) as typeof toast.error;

/**
 * Pop-up messages: a quiet card with a coloured icon for the kind of message,
 * bottom-right on a computer and at the top on a phone (clear of the tab bar).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();
  const isMobile = useIsMobile();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={isMobile ? "top-center" : "bottom-right"}
      offset={isMobile ? 12 : 24}
      gap={10}
      visibleToasts={4}
      closeButton
      icons={{
        success: <CircleCheck className="h-5 w-5" aria-hidden />,
        error: <CircleAlert className="h-5 w-5" aria-hidden />,
        warning: <TriangleAlert className="h-5 w-5" aria-hidden />,
        info: <Info className="h-5 w-5" aria-hidden />,
        loading: <Loader2 className="h-5 w-5 animate-spin" aria-hidden />,
      }}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast: [
            "group toast flex w-full items-start gap-3 p-4 pr-10",
            "rounded-xl border border-border bg-popover text-popover-foreground",
            "shadow-lg shadow-foreground/5",
          ].join(" "),
          content: "flex min-w-0 flex-col gap-0.5",
          title: "text-sm font-semibold leading-5 text-foreground",
          description: "text-sm leading-5 text-muted-foreground",
          icon: "!m-0 mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-muted-foreground",
          success: "[&_[data-icon]]:text-success",
          error: "[&_[data-icon]]:text-destructive",
          warning: "[&_[data-icon]]:text-warning",
          info: "[&_[data-icon]]:text-info",
          closeButton: [
            "!left-auto !right-2 !top-2 !translate-x-0 !translate-y-0",
            "!h-7 !w-7 !rounded-md !border-0 !bg-transparent !text-muted-foreground",
            "hover:!bg-muted hover:!text-foreground",
          ].join(" "),
          actionButton:
            "!h-8 !rounded-md !bg-primary !px-3 !text-xs !font-medium !text-primary-foreground hover:!bg-primary/90",
          cancelButton: "!h-8 !rounded-md !bg-muted !px-3 !text-xs !font-medium !text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
