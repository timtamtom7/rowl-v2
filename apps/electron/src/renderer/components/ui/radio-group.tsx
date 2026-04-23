import * as React from "react"
import { cn } from "@/lib/utils"

export interface RadioGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string
  onValueChange?: (value: string) => void
}

const RadioGroup = React.forwardRef<HTMLDivElement, RadioGroupProps>(
  ({ className, value, onValueChange, ...props }, ref) => {
    return (
      <div
        className={cn("grid gap-2", className)}
        {...props}
        ref={ref}
        role="radiogroup"
      />
    )
  }
)
RadioGroup.displayName = "RadioGroup"

export interface RadioGroupItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string
}

const RadioGroupItem = React.forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, id, ...props }, ref) => {
    return (
      <input
        type="radio"
        id={id}
        ref={ref}
        className={cn(
          "aspect-square h-4 w-4 rounded-full border border-primary text-primary shadow focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
RadioGroupItem.displayName = "RadioGroupItem"

export { RadioGroup, RadioGroupItem }
