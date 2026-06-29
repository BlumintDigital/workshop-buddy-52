import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Workshop Buddy branded toasts.
 * "Sage bordered card" direction — cream surface, sage leading accent,
 * branded icon chip, asymmetric radii. Positioned top-right.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      offset={20}
      gap={12}
      toastOptions={{
        unstyled: false,
        classNames: {
          toast: [
            "group toast wb-toast",
            "flex items-center gap-3 py-3.5 pl-4 pr-5",
            "bg-card text-foreground",
            "border border-border/70 ring-1 ring-black/[0.03]",
            "border-l-[3px] border-l-primary",
            "rounded-l-md rounded-r-2xl",
            "shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.25),0_4px_10px_-4px_rgb(0_0_0/0.08)]",
            "backdrop-blur-sm",
          ].join(" "),
          title: "text-sm font-semibold tracking-tight text-foreground",
          description: "text-xs text-muted-foreground mt-0.5",
          icon: [
            "wb-toast-icon",
            "flex-shrink-0 grid place-items-center",
            "w-9 h-9 rounded-full",
            "bg-primary/10 border border-primary/20 text-primary",
          ].join(" "),
          closeButton: [
            "!left-auto !right-2 !top-1/2 !-translate-y-1/2",
            "!bg-transparent !border-0 !text-muted-foreground hover:!text-foreground",
            "!h-6 !w-6",
          ].join(" "),
          success: "border-l-primary [&_.wb-toast-icon]:bg-primary/10 [&_.wb-toast-icon]:text-primary [&_.wb-toast-icon]:border-primary/20",
          error:
            "!border-l-destructive [&_.wb-toast-icon]:!bg-destructive/10 [&_.wb-toast-icon]:!text-destructive [&_.wb-toast-icon]:!border-destructive/20",
          warning:
            "!border-l-amber-500 [&_.wb-toast-icon]:!bg-amber-500/10 [&_.wb-toast-icon]:!text-amber-600 [&_.wb-toast-icon]:!border-amber-500/20",
          info: "!border-l-accent [&_.wb-toast-icon]:!bg-accent/20 [&_.wb-toast-icon]:!text-accent-foreground [&_.wb-toast-icon]:!border-accent/30",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:h-7 group-[.toast]:text-xs",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-full group-[.toast]:px-3 group-[.toast]:h-7 group-[.toast]:text-xs",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
