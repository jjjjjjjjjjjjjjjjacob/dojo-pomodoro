"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  onValueChange?: (value: string) => void;
};

export function Select({ className, onChange, onValueChange, children, ...props }: SelectProps) {
  return (
    <select
      className={cn("border rounded px-2 py-1 text-sm bg-background", className)}
      onChange={(e) => {
        onChange?.(e);
        onValueChange?.(e.target.value);
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function SelectOption({ className, ...props }: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option className={cn(className)} {...props} />;
}

