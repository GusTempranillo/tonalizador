import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-[14px] text-sm font-semibold tracking-[-0.01em] outline-none transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:ring-4 focus-visible:ring-[#8b5cf6]/25 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[#a78bfa]/70 bg-[linear-gradient(180deg,#9568f6_0%,#7c3aed_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.24),0_12px_30px_rgba(124,58,237,.3)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,#a178fb_0%,#8647ee_100%)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_16px_36px_rgba(124,58,237,.4)] active:translate-y-0",
        destructive:
          "border border-[#fb7185]/30 bg-[#fb7185]/10 text-[#fda4af] shadow-none hover:border-[#fb7185]/45 hover:bg-[#fb7185]/15",
        outline:
          "border border-white/10 bg-white/[.045] text-[#ebe9f2] shadow-[inset_0_1px_0_rgba(255,255,255,.035)] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[.075] active:translate-y-0",
        secondary:
          "border border-[#8b5cf6]/20 bg-[#8b5cf6]/10 text-[#c4b5fd] hover:bg-[#8b5cf6]/16",
        ghost:
          "border border-transparent bg-transparent text-[#9c98aa] shadow-none hover:bg-white/[.055] hover:text-white",
        link: "rounded-none text-[#a78bfa] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 rounded-xl px-3.5 text-xs",
        lg: "h-[52px] rounded-2xl px-6 text-[15px]",
        icon: "size-11 p-0",
        "icon-sm": "size-9 p-0",
        "icon-lg": "size-[52px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
