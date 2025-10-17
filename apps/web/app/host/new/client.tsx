"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useForm } from "react-hook-form";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectOption } from "@/components/ui/select";
import { FlyerUpload } from "@/components/flyer-upload";
import { CustomFieldsBuilderForm } from "@/components/custom-fields-builder";
import { toast } from "sonner";
import {
  ApplicationError,
  EventFormData,
  ListCredentialInput,
  CustomField,
} from "@/lib/types";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
  isValidHexColor,
  normalizeHexColorInput,
} from "@/lib/event-theme";

function validateCreate(values: EventFormData): string[] {
  const validationErrors: string[] = [];
  if (!values.name?.trim()) validationErrors.push("Name is required");
  if (!values.hosts?.trim()) validationErrors.push("Hosts are required");
  if (!values.location?.trim()) validationErrors.push("Location is required");
  if (!values.eventDate) validationErrors.push("Event date is required");
  const lists: ListCredentialInput[] = values.lists || [];
  const filteredLists = lists.filter(
    (list) => list.listKey?.trim() && list.password?.trim(),
  );
  if (filteredLists.length === 0) {
    validationErrors.push("Add at least one list/password");
  }
  if (
    values.themeBackgroundColor &&
    !isValidHexColor(values.themeBackgroundColor)
  ) {
    validationErrors.push(
      "Background color must be a valid hex color (e.g. #FFFFFF)",
    );
  }
  if (values.themeTextColor && !isValidHexColor(values.themeTextColor)) {
    validationErrors.push(
      "Text color must be a valid hex color (e.g. #EF4444)",
    );
  }
  return validationErrors;
}

export default function NewEventClient() {
  const router = useRouter();
  const create = useAction(api.eventsNode.create);
  const form = useForm<EventFormData>({
    defaultValues: {
      name: "",
      hosts: "",
      location: "",
      eventDate: "",
      eventTime: "19:00",
      flyerStorageId: null,
      maxAttendees: 1,
      lists: [
        { listKey: "vip", password: "" },
        { listKey: "ga", password: "" },
      ],
      customFieldsJson: "[]",
      themeBackgroundColor: EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
      themeTextColor: EVENT_THEME_DEFAULT_TEXT_COLOR,
    },
  });

  const lists = form.watch("lists");

  const addList = () => {
    const existingLists = form.getValues("lists") || [];
    form.setValue("lists", [
      ...existingLists,
      { listKey: "", password: "" },
    ]);
  };

  const setList = (
    listIndex: number,
    key: "listKey" | "password",
    value: string,
  ) => {
    const existingLists = form.getValues("lists") || [];
    const updatedLists = existingLists.map((list, index) =>
      index === listIndex ? { ...list, [key]: value } : list,
    );
    form.setValue("lists", updatedLists);
  };

  const removeList = (listIndex: number) => {
    const existingLists = form.getValues("lists") || [];
    const updatedLists = existingLists.filter(
      (_list, index) => index !== listIndex,
    );
    form.setValue("lists", updatedLists);
  };

  const onSubmit = async (values: EventFormData) => {
    const validationErrors = validateCreate(values);
    if (validationErrors.length) {
      validationErrors.forEach((errorMessage) => toast.error(errorMessage));
      return;
    }
    try {
      const hostEmails = values.hosts
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);
      const [yearString, monthString, dayString] = (values.eventDate || "").split("-");
      const [hourString, minuteString] = (values.eventTime || "00:00").split(":");
      // Create date in UTC to avoid timezone issues during storage/display
      const eventTimestamp = new Date(
        Date.UTC(
          Number(yearString),
          Number(monthString) - 1,
          Number(dayString),
          Number(hourString) || 0,
          Number(minuteString) || 0,
        ),
      ).getTime();
      const filteredLists = (values.lists || []).filter(
        (list) => list.listKey?.trim() && list.password?.trim(),
      );
      const customFields: CustomField[] = JSON.parse(
        values.customFieldsJson || "[]",
      );
      const normalizedThemeBackgroundColor =
        normalizeHexColorInput(values.themeBackgroundColor) ??
        EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
      const normalizedThemeTextColor =
        normalizeHexColorInput(values.themeTextColor) ??
        EVENT_THEME_DEFAULT_TEXT_COLOR;
      await create({
        name: values.name.trim(),
        hosts: hostEmails,
        location: values.location.trim(),
        flyerStorageId: values.flyerStorageId || undefined,
        eventDate: eventTimestamp,
        maxAttendees: values.maxAttendees,
        lists: filteredLists,
        customFields,
        themeBackgroundColor: normalizedThemeBackgroundColor,
        themeTextColor: normalizedThemeTextColor,
      });
      toast.success("Event created");
      router.replace("/host/events?created=1");
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to create event");
    }
  };

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Create Event</h2>
          <p className="text-muted-foreground">
            Set up a new event with custom fields and guest lists
          </p>
        </div>
      </div>

      <div className="max-w-2xl space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Event Basic Info */}
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
                name="themeBackgroundColor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Background Color</FormLabel>
                    <FormDescription>
                      Applied to event, RSVP, and ticket pages.
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
                      Updates headings and buttons across guest pages.
                    </FormDescription>
                    <FormControl>
                      <Input
                        type="color"
                        value={field.value ?? EVENT_THEME_DEFAULT_TEXT_COLOR}
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

          {/* Date, Time & Capacity */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              DATE & CAPACITY
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="eventDate"
                rules={{ required: "Event date is required" }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="eventTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time</FormLabel>
                    <FormControl>
                      <Input type="time" step={60} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="maxAttendees"
                render={({ field }) => (
                  <FormItem className="w-36 sm:ml-auto">
                    <FormLabel>Max Attendees</FormLabel>
                    <FormControl>
                      <Select
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

          {/* Flyer */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              EVENT FLYER
            </h3>
            <FormField
              control={form.control}
              name="flyerStorageId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Upload Flyer (Optional)</FormLabel>
                  <FormControl>
                    <FlyerUpload
                      value={field.value || null}
                      onChange={(v) => field.onChange(v)}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          {/* Access Lists & Passwords */}
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h3 className="font-medium text-sm text-muted-foreground">
              ACCESS LISTS & PASSWORDS
            </h3>
            <div className="space-y-3">
              {(lists || []).map((lp, idx) => (
                <div
                  key={idx}
                  className="flex gap-3 items-end p-3 rounded-lg border bg-background"
                >
                  <div className="flex flex-col w-full">
                    <label className="text-xs font-medium text-muted-foreground">
                      List Name
                    </label>
                    <Input
                      placeholder="e.g. vip, general, backstage"
                      value={lp.listKey}
                      onChange={(e) => setList(idx, "listKey", e.target.value)}
                    />
                  </div>
                  <div className="flex w-full flex-col">
                    <label className="text-xs font-medium text-muted-foreground">
                      Password
                    </label>
                    <Input
                      placeholder="Enter secure password"
                      value={lp.password}
                      onChange={(e) => setList(idx, "password", e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => removeList(idx)}
                    className="h-10"
                  >
                    Remove
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addList}
                className="w-full"
              >
                + Add Another List
              </Button>
            </div>
          </div>

          <CustomFieldsBuilderForm />

          {/* Submit */}
          <div className="flex justify-end pt-4 border-t">
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              size="lg"
            >
              {form.formState.isSubmitting
                ? "Creating Event..."
                : "Create Event"}
            </Button>
          </div>
        </form>
      </Form>
      </div>
    </div>
  );
}
