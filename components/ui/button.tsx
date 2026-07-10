import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // The "lily-pad press": interactive controls rest on a colored underside edge
  // (shadow-pad) and press down into the pond on :active. Quiet everywhere else.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,box-shadow,background-color,color] duration-[var(--duration-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-pad hover:brightness-105 active:translate-y-0.5 active:shadow-none",
        crown:
          "bg-accent text-accent-foreground shadow-sm hover:brightness-105 active:translate-y-0.5 active:shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70 active:translate-y-0.5",
        outline: "border border-input bg-transparent hover:bg-secondary/60 active:translate-y-0.5",
        ghost: "hover:bg-secondary/60 active:translate-y-0.5",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:brightness-105 active:translate-y-0.5 active:shadow-none",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-md px-3.5",
        lg: "h-12 rounded-lg px-8 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  );
});

export { Button, buttonVariants };
export type { ButtonProps };
