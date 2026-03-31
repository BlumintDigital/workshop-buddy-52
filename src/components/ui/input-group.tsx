import * as React from "react"
import { cn } from "@/lib/utils"
import { Button, type ButtonProps } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const InputGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("relative flex items-center", className)} {...props} />
  )
)
InputGroup.displayName = "InputGroup"

const InputGroupInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <Input ref={ref} className={cn("pr-10", className)} {...props} />
  )
)
InputGroupInput.displayName = "InputGroupInput"

interface InputGroupAddonProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "inline-start" | "inline-end"
}

const InputGroupAddon = React.forwardRef<HTMLDivElement, InputGroupAddonProps>(
  ({ className, align = "inline-end", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 flex items-center",
        align === "inline-end" ? "right-1.5" : "left-1.5",
        className
      )}
      {...props}
    />
  )
)
InputGroupAddon.displayName = "InputGroupAddon"

interface InputGroupButtonProps extends ButtonProps {
  "aria-label"?: string
}

const InputGroupButton = React.forwardRef<HTMLButtonElement, InputGroupButtonProps>(
  ({ className, variant = "ghost", size = "icon", ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={cn("h-7 w-7", className)}
      {...props}
    />
  )
)
InputGroupButton.displayName = "InputGroupButton"

export { InputGroup, InputGroupInput, InputGroupAddon, InputGroupButton }
