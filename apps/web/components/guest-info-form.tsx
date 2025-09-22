"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectOption } from "@/components/ui/select";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Event, CustomField, UseFormReturn, RSVPFormData } from "@/lib/types";

export function GuestInfoFields({
  form,
  event,
  name,
  setName,
  firstName,
  setFirstName,
  lastName,
  setLastName,
  custom,
  setCustom,
  phone,
  openUserProfile,
  isSignedIn,
}: {
  form: UseFormReturn<RSVPFormData>;
  event: Event;
  name: string; // Keep during migration phase
  setName: (v: string) => void;
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  custom: Record<string, string>;
  setCustom: (
    updater: (m: Record<string, string>) => Record<string, string>,
  ) => void;
  phone: string;
  openUserProfile?: () => void;
  isSignedIn?: boolean;
}) {
  return (
    <div className="rounded border border-primary/30 p-3 space-y-2">
      <div className="font-semibold text-sm text-primary">YOUR INFO</div>
      <div className="grid grid-cols-2 gap-2">
        <FormField
          control={form.control}
          name="firstName"
          rules={{ required: "First name is required" }}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-primary text-xs font-medium">
                FIRST NAME <span className="text-xs text-primary/70">(required)</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="First name"
                  className="border border-primary/20 placeholder:text-primary/50 text-primary"
                  value={firstName}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    setFirstName(value);
                    field.onChange(value);
                    // Update combined name for backward compatibility
                    setName(`${value} ${lastName}`.trim());
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-primary text-xs font-medium">
                LAST NAME
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="Last name"
                  className="border border-primary/20 placeholder:text-primary/50 text-primary"
                  value={lastName}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    setLastName(value);
                    field.onChange(value);
                    // Update combined name for backward compatibility
                    setName(`${firstName} ${value}`.trim());
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      {(event?.customFields || []).map((customField: CustomField) => (
        <FormField
          key={customField.key}
          control={form.control}
          name={`custom.${customField.key}` as keyof RSVPFormData}
          rules={
            customField.required
              ? {
                  required: `${customField.label || customField.key} is required`,
                }
              : undefined
          }
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-primary text-xs font-medium">
                {customField.label || customField.key}
                {customField.required && (
                  <span className="text-xs text-primary/70"> (required)</span>
                )}
              </FormLabel>
              <FormControl>
                <Input
                  placeholder={
                    customField.placeholder ||
                    customField.label ||
                    customField.key
                  }
                  className="border border-primary/20 placeholder:text-primary/50 text-primary"
                  value={custom[customField.key] || ""}
                  onChange={(e) => {
                    setCustom((m) => ({
                      ...m,
                      [customField.key]: e.target.value.trim(),
                    }));
                    field.onChange(e.target.value.trim());
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      ))}

      <div className="flex flex-col gap-1">
        <Label className="text-sm flex items-center gap-2 text-xs text-primary font-medium">
          PHONE
        </Label>
        <div className="flex gap-4">
          <Input
            key="phone"
            className="text-sm text-primary/90 border border-primary/20 placeholder:text-primary/50 text-primary/80 disabled:opacity-100"
            value={phone}
            disabled
          />
          {isSignedIn ? (
            <Button
              variant="outline"
              onClick={() => openUserProfile?.()}
              className="border-primary/30 text-primary/70"
            >
              UPDATE
            </Button>
          ) : (
            <div className="text-xs text-primary/60 flex items-center">
              Sign in to update
            </div>
          )}
        </div>
      </div>

      {/* Attendees selection */}
      <FormField
        control={form.control}
        name="attendees"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs text-primary font-medium">
              ATTENDEES{" "}
              {event.maxAttendees && event.maxAttendees > 1
                ? `(${event.maxAttendees} max)`
                : null}
            </FormLabel>
            <FormControl>
              {(event?.maxAttendees ?? 1) === 1 ? (
                <Select
                  value="1"
                  disabled
                  className="border border-primary/20 text-primary disabled:opacity-100"
                >
                  <SelectOption value="1">1 (No Plus Ones)</SelectOption>
                </Select>
              ) : (
                <Select
                  value={field.value?.toString() || "1"}
                  onValueChange={(value) => field.onChange(parseInt(value, 10))}
                  className="border border-primary/20 text-primary"
                >
                  {Array.from({ length: event?.maxAttendees ?? 1 }, (_, i) => (
                    <SelectOption key={i + 1} value={(i + 1).toString()}>
                      {i + 1}
                    </SelectOption>
                  ))}
                </Select>
              )}
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
