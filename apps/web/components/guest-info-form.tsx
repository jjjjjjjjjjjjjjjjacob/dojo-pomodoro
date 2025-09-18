"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import {
  Event,
  CustomField,
  UseFormReturn,
  RSVPFormData
} from "@/lib/types";

export function GuestInfoFields({
  form,
  event,
  name,
  setName,
  custom,
  setCustom,
  phone,
  openUserProfile,
  isSignedIn,
}: {
  form: UseFormReturn<RSVPFormData>;
  event: Event;
  name: string;
  setName: (v: string) => void;
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
      <div className="font-semibold text-sm text-primary">Your Info</div>
      <FormField
        control={form.control}
        name="name"
        rules={{ required: "Name is required" }}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-primary text-xs font-medium">
              Name <span className="text-xs text-primary/70">(required)</span>
            </FormLabel>
            <FormControl>
              <Input
                placeholder="Your name"
                className="border border-primary/20 placeholder:text-primary/50 text-primary"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  field.onChange(e);
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {(event?.customFields || []).map((customField: CustomField) => (
        <FormField
          key={customField.key}
          control={form.control}
          name={`custom.${customField.key}` as keyof RSVPFormData}
          rules={
            customField.required
              ? { required: `${customField.label || customField.key} is required` }
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
                  placeholder={customField.placeholder || customField.label || customField.key}
                  className="border border-primary/20 placeholder:text-primary/50 text-primary"
                  value={custom[customField.key] || ""}
                  onChange={(e) => {
                    setCustom((m) => ({ ...m, [customField.key]: e.target.value }));
                    field.onChange(e);
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
          Phone
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
              Update
            </Button>
          ) : (
            <div className="text-xs text-primary/60 flex items-center">
              Sign in to update
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
