import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded-[14px] border border-[#dedce7] bg-white px-4 text-sm text-[#242130] shadow-[0_1px_2px_rgba(28,25,43,.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#9893a5] focus-visible:border-[#8174dc] focus-visible:ring-4 focus-visible:ring-[#6252d8]/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
