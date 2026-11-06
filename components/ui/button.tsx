import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
const variants = cva("button", {
  variants: {
    variant: {
      default: "button-primary",
      outline: "button-outline",
      destructive: "button-danger",
    },
  },
  defaultVariants: { variant: "default" },
});
export function Button({
  className,
  variant,
  asChild = false,
  loading = false,
  disabled,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof variants> & { asChild?: boolean; loading?: boolean }) {
  const styles = cn(variants({ variant }), className);
  if (asChild) return <Slot className={styles} disabled={disabled} {...props} />;
  return (
    <button
      className={styles}
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"]}
      data-loading={loading || undefined}
    />
  );
}
