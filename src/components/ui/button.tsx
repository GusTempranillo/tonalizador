import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-[14px] text-sm font-semibold tracking-[-0.01em] outline-none transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-200 disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-4 focus-visible:ring-[#6252d8]/15 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-[#4f46b9] bg-[linear-gradient(180deg,#6d63df_0%,#5649c7_100%)] text-white shadow-[0_1px_2px_rgba(40,34,100,.18),0_8px_20px_rgba(87,73,199,.18)] hover:-translate-y-0.5 hover:bg-[linear-gradient(180deg,#786ee6_0%,#5c4fd0_100%)] hover:shadow-[0_2px_3px_rgba(40,34,100,.16),0_12px_24px_rgba(87,73,199,.22)] active:translate-y-0",
        destructive:
          "border border-[#dfb5b2] bg-[#fff8f7] text-[#a13d37] shadow-[0_1px_2px_rgba(85,24,19,.05)] hover:border-[#d69a96] hover:bg-[#fff1ef]",
        outline:
          "border border-[#dedce7] bg-[linear-gradient(180deg,#fff_0%,#fbfafc_100%)] text-[#2b2938] shadow-[0_1px_2px_rgba(28,25,43,.04)] hover:-translate-y-0.5 hover:border-[#c8c4d8] hover:bg-white hover:shadow-[0_7px_18px_rgba(29,25,53,.08)] active:translate-y-0",
        secondary:
          "border border-[#e7e5ee] bg-[#f3f1f8] text-[#51499b] hover:bg-[#ece9f6]",
        ghost:
          "border border-transparent bg-transparent text-[#5e5a6b] shadow-none hover:bg-[#f0eef5] hover:text-[#242130]",
        link: "rounded-none text-[#5c4fd0] underline-offset-4 hover:underline",
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
  },
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
