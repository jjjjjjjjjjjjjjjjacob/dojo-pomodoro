"use client";
import React from "react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { FlyerUpload } from "@/components/flyer-upload";
import { DateTimePicker } from "@/components/date-time-picker";
import { UseFormReturn, BaseEventFormValues } from "@/lib/types";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
} from "@/lib/event-theme";

export interface HostEventFormProps<FormValues extends BaseEventFormValues> {
  form: UseFormReturn<FormValues>;
  onSubmit: (values: FormValues) => Promise<void> | void;
  submitLabel: string;
  submittingLabel?: string;
  isSubmitting: boolean;
  flyerStorageId: string | null;
  onFlyerChange: (value: string | null) => void;
  listsSection?: React.ReactNode;
  customFieldsSection?: React.ReactNode;
  footer?: React.ReactNode;
}

export function HostEventForm<FormValues extends BaseEventFormValues>({
  form,
  onSubmit,
  submitLabel,
  submittingLabel,
  isSubmitting,
  flyerStorageId,
  onFlyerChange,
  listsSection,
  customFieldsSection,
  footer,
}: HostEventFormProps<FormValues>) {
  const selectedEventTime =
    form.watch("eventTime") || "19:00";
  const selectedEventTimezone =
    form.watch("eventTimezone") ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-6"
      >
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground">
            EVENT DETAILS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="name"
              rules={{ required: "Name is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter event name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="secondaryTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Secondary Title{" "}
                    <span className="text-sm text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="After Party, Hosted by..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="themeBackgroundColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Background Color</FormLabel>
                  <FormDescription>
                    Applied to guest RSVP and ticket pages.
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="color"
                      value={
                        field.value ?? EVENT_THEME_DEFAULT_BACKGROUND_COLOR
                      }
                      onChange={(event) => field.onChange(event.target.value)}
                      className="h-10 w-full cursor-pointer p-1"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="themeTextColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Text Color</FormLabel>
                  <FormDescription>
                    Used for emphasis across guest experiences.
                  </FormDescription>
                  <FormControl>
                    <Input
                      type="color"
                      value={
                        field.value ?? EVENT_THEME_DEFAULT_TEXT_COLOR
                      }
                      onChange={(event) => field.onChange(event.target.value)}
                      className="h-10 w-full cursor-pointer p-1"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="location"
            rules={{ required: "Location is required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="Enter venue or location" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="hosts"
            rules={{ required: "Hosts are required" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Host Emails (comma-separated)</FormLabel>
                <FormControl>
                  <Input
                    placeholder="host1@example.com, host2@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground">
            DATE & CAPACITY
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="eventDate"
              rules={{ required: "Event date is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date, Time & Timezone</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      date={field.value}
                      time={selectedEventTime}
                      timezone={selectedEventTimezone}
                      onDateChange={(value) => field.onChange(value)}
                      onTimeChange={(value) =>
                        form.setValue("eventTime" as keyof FormValues, value, {
                          shouldDirty: true,
                        })
                      }
                      onTimezoneChange={(value) =>
                        form.setValue(
                          "eventTimezone" as keyof FormValues,
                          value,
                          {
                            shouldDirty: true,
                          },
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="maxAttendees"
              render={({ field }) => (
                <FormItem className="w-full max-w-xs md:max-w-[12rem] md:ml-auto">
                  <FormLabel>Max Attendees</FormLabel>
                  <FormControl>
                    <Select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={field.value?.toString() || "1"}
                      onValueChange={(value) =>
                        field.onChange(parseInt(value, 10))
                      }
                    >
                      <SelectOption value="1">1 (No plus-ones)</SelectOption>
                      <SelectOption value="2">2</SelectOption>
                      <SelectOption value="3">3</SelectOption>
                      <SelectOption value="4">4</SelectOption>
                      <SelectOption value="5">5</SelectOption>
                      <SelectOption value="6">6</SelectOption>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground">
            EVENT FLYER
          </h3>
          <FormField
            control={form.control}
            name="flyerStorageId"
            render={() => (
              <FormItem>
                <FormLabel>Upload Flyer (Optional)</FormLabel>
                <FormControl>
                  <FlyerUpload
                    value={flyerStorageId}
                    onChange={onFlyerChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>

        {listsSection}

        {customFieldsSection}

        {footer ?? (
          <div className="flex justify-end pt-4 border-t">
            <Button type="submit" disabled={isSubmitting} size="lg">
              {isSubmitting ? submittingLabel ?? `${submitLabel}...` : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </Form>
  );
}
