import * as React from "react";

import { cn } from "@/lib/utils";

type CardTone = "default" | "cream" | "mist" | "sage" | "blush" | "sky" | "butter";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
}

// Tones are deprecated: surfaces are neutral and colour is reserved for state.
// The prop is kept so existing call sites compile; every tone renders as the card surface.
const toneClass: Record<CardTone, string> = {
  default: "bg-card",
  cream: "bg-card",
  mist: "bg-card",
  sage: "bg-card",
  blush: "bg-card",
  sky: "bg-card",
  butter: "bg-card",
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, tone = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-border text-card-foreground",
      toneClass[tone],
      className,
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-lg font-semibold leading-tight tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
