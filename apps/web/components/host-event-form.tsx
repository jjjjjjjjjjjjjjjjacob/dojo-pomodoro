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
import { EventIconUpload } from "@/components/event-icon-upload";
import { DateTimePicker } from "@/components/date-time-picker";
import type { UseFormReturn, BaseEventFormValues } from "@/lib/types";
import type { Path, PathValue } from "react-hook-form";
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
  eventIconStorageId: string | null;
  onEventIconChange: (value: string | null) => void;
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
  eventIconStorageId,
  onEventIconChange,
  listsSection,
  customFieldsSection,
  footer,
}: HostEventFormProps<FormValues>) {
  const selectedEventTime =
    (form.watch("eventTime" as Path<FormValues>) as string | undefined) ??
    "19:00";
  const selectedEventTimezone =
    (form.watch("eventTimezone" as Path<FormValues>) as string | undefined) ??
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const selectedEventDate = form.watch(
    "eventDate" as Path<FormValues>,
  ) as string | undefined;

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
              name={"name" as Path<FormValues>}
              rules={{ required: "Name is required" }}
              render={({ field }) => {
                const { value, onChange, ref, ...rest } = field
                return (
                  <FormItem>
                    <FormLabel>Event Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter event name"
                        value={(value as string | undefined) ?? ""}
                        onChange={onChange}
                        ref={ref}
                        {...rest}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            <FormField
              control={form.control}
              name={"secondaryTitle" as Path<FormValues>}
              render={({ field }) => {
                const { value, onChange, ref, ...rest } = field
                return (
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
                        value={(value as string | undefined) ?? ""}
                        onChange={onChange}
                        ref={ref}
                        {...rest}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            <FormField
              control={form.control}
              name={"themeBackgroundColor" as Path<FormValues>}
              render={({ field }) => {
                const { value, onChange } = field
                return (
                  <FormItem>
                    <FormLabel>Background Color</FormLabel>
                    <FormDescription>
                      Applied to guest RSVP and ticket pages.
                    </FormDescription>
                    <FormControl>
                      <Input
                        type="color"
                        value={
                          (typeof value === "string" ? value : undefined) ??
                            EVENT_THEME_DEFAULT_BACKGROUND_COLOR
                        }
                        onChange={(event) => onChange(event.target.value)}
                        className="h-10 w-full cursor-pointer p-1"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            <FormField
              control={form.control}
              name={"themeTextColor" as Path<FormValues>}
              render={({ field }) => {
                const { value, onChange } = field
                return (
                  <FormItem>
                    <FormLabel>Primary Text Color</FormLabel>
                    <FormDescription>
                      Used for emphasis across guest experiences.
                    </FormDescription>
                    <FormControl>
                      <Input
                        type="color"
                        value={
                          (typeof value === "string" ? value : undefined) ??
                            EVENT_THEME_DEFAULT_TEXT_COLOR
                        }
                        onChange={(event) => onChange(event.target.value)}
                        className="h-10 w-full cursor-pointer p-1"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            <FormField
              control={form.control}
              name={"customIconStorageId" as Path<FormValues>}
              render={() => (
                <FormItem className="md:col-span-2">
                  <FormLabel>
                    Event Icon{" "}
                    <span className="text-sm text-muted-foreground">
                      (optional)
                    </span>
                  </FormLabel>
                  <FormDescription>
                    Overrides the default favicon and navigation icon wherever custom theming is applied.
                  </FormDescription>
                  <FormControl>
                    <EventIconUpload
                      value={eventIconStorageId}
                      onChange={onEventIconChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
            <FormField
              control={form.control}
              name={"location" as Path<FormValues>}
              rules={{ required: "Location is required" }}
              render={({ field }) => {
                const { value, onChange, ref, ...rest } = field
                return (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter venue or location"
                        value={(value as string | undefined) ?? ""}
                        onChange={onChange}
                        ref={ref}
                        {...rest}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            <FormField
              control={form.control}
              name={"hosts" as Path<FormValues>}
              rules={{ required: "Hosts are required" }}
              render={({ field }) => {
                const { value, onChange, ref, ...rest } = field
                return (
                  <FormItem>
                    <FormLabel>Host Emails (comma-separated)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="host1@example.com, host2@example.com"
                        value={(value as string | undefined) ?? ""}
                        onChange={onChange}
                        ref={ref}
                        {...rest}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground">
            DATE & CAPACITY
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name={"eventDate" as Path<FormValues>}
              rules={{ required: "Event date is required" }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date, Time & Timezone</FormLabel>
                  <FormControl>
                    <DateTimePicker
                      date={selectedEventDate}
                      time={selectedEventTime}
                      timezone={selectedEventTimezone}
                      onDateChange={(value) => field.onChange(value)}
                      onTimeChange={(value) =>
                        form.setValue(
                          "eventTime" as Path<FormValues>,
                          value as PathValue<FormValues, Path<FormValues>>,
                          {
                            shouldDirty: true,
                          },
                        )
                      }
                      onTimezoneChange={(value) =>
                        form.setValue(
                          "eventTimezone" as Path<FormValues>,
                          value as PathValue<FormValues, Path<FormValues>>,
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
              name={"maxAttendees" as Path<FormValues>}
              render={({ field }) => (
                <FormItem className="w-full max-w-xs md:max-w-[12rem] md:ml-auto">
                  <FormLabel>Max Attendees</FormLabel>
                  <FormControl>
                    <Select
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={field.value ? String(field.value) : "1"}
                      onValueChange={(
                        value
                      ) =>
                        field.onChange(
                          Number.parseInt(value, 10) as PathValue<
                            FormValues,
                            Path<FormValues>
                          >,
                        )
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
          name={"flyerStorageId" as Path<FormValues>}
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
