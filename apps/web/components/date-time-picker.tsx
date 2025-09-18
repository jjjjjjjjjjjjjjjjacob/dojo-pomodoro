"use client";
import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export type DateTimePickerProps = {
  date: string | undefined; // YYYY-MM-DD
  time: string | undefined; // HH:mm
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  className?: string;
  buttonClassName?: string;
};

export function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  className,
  buttonClassName,
}: DateTimePickerProps) {
  const selectedDate = React.useMemo(() => {
    if (!date) return undefined;
    const [year, month, day] = date.split("-").map((value) => parseInt(value, 10));
    if (!year || !month || !day) return undefined;
    return new Date(year, month - 1, day);
  }, [date]);

  const formattedDate = React.useMemo(() => {
    if (!selectedDate) return "Pick a date";
    return selectedDate.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }, [selectedDate]);

  return (
    <div className={cn("flex flex-wrap gap-2 items-center", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-[280px] justify-start text-left font-normal",
              !date && "text-muted-foreground",
              buttonClassName,
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formattedDate}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              onDateChange(`${year}-${month}-${day}`);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      <div className="relative">
        <Clock className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="time"
          value={time || ""}
          onChange={(e) => onTimeChange(e.target.value)}
          step={60}
          className="pl-8 w-[140px]"
        />
      </div>
    </div>
  );
}
