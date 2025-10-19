"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HostEventForm } from "@/components/host-event-form";
import {
  CustomFieldsEditor,
  type CustomFieldDef,
} from "@/components/custom-fields-builder";
import { createTimestamp } from "@/lib/date-utils";
import { toast } from "sonner";
import { ApplicationError, EventFormData } from "@/lib/types";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
  isValidHexColor,
  normalizeHexColorInput,
} from "@/lib/event-theme";
import { Id } from "@convex/_generated/dataModel";

type ListRow = { listKey: string; password: string };

function validateCreate(values: EventFormData, lists: ListRow[]): string[] {
  const validationErrors: string[] = [];
  if (!values.name?.trim()) validationErrors.push("Name is required");
  if (!values.hosts?.trim()) validationErrors.push("Hosts are required");
  if (!values.location?.trim()) validationErrors.push("Location is required");
  if (!values.eventDate) validationErrors.push("Event date is required");
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
      secondaryTitle: "",
      hosts: "",
      location: "",
      eventDate: "",
      eventTime: "19:00",
      eventTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      flyerStorageId: null,
      customIconStorageId: null,
      maxAttendees: 1,
      themeBackgroundColor: EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
      themeTextColor: EVENT_THEME_DEFAULT_TEXT_COLOR,
    },
  });

  const flyerStorageId = form.watch("flyerStorageId") ?? null;
  const eventIconStorageId = form.watch("customIconStorageId") ?? null;
  const [lists, setLists] = React.useState<ListRow[]>([
    { listKey: "vip", password: "" },
    { listKey: "ga", password: "" },
  ]);
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>([]);

  const addList = () =>
    setLists((current) => [...current, { listKey: "", password: "" }]);
  const setList = (index: number, key: keyof ListRow, value: string) => {
    setLists((current) =>
      current.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  };
  const removeList = (index: number) =>
    setLists((current) => current.filter((_, idx) => idx !== index));

  const onSubmit = async (values: EventFormData) => {
    const validationErrors = validateCreate(values, lists);
    if (validationErrors.length) {
      validationErrors.forEach((message) => toast.error(message));
      return;
    }
    try {
      const hostEmails = values.hosts
        .split(",")
        .map((email) => email.trim())
        .filter(Boolean);
      const timestamp = createTimestamp(
        values.eventDate,
        values.eventTime,
        values.eventTimezone,
      );
      const listsFiltered = lists
        .map((list) => ({
          listKey: list.listKey.trim(),
          password: list.password.trim(),
        }))
        .filter((list) => list.listKey && list.password);
      const trimmedSecondaryTitle = values.secondaryTitle?.trim() ?? "";
      const normalizedThemeBackgroundColor =
        normalizeHexColorInput(values.themeBackgroundColor) ??
        EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
      const normalizedThemeTextColor =
        normalizeHexColorInput(values.themeTextColor) ??
        EVENT_THEME_DEFAULT_TEXT_COLOR;
      await create({
        name: values.name.trim(),
        secondaryTitle: trimmedSecondaryTitle || undefined,
        hosts: hostEmails,
        location: values.location.trim(),
        flyerStorageId: values.flyerStorageId ? (values.flyerStorageId as unknown as Id<"_storage"> | undefined) : undefined,
        customIconStorageId: values.customIconStorageId ? (values.customIconStorageId as unknown as Id<"_storage"> | null) : null,
        eventDate: timestamp,
        eventTimezone: values.eventTimezone,
        maxAttendees: values.maxAttendees,
        lists: listsFiltered,
        customFields: customFields.map((field) => ({
          key: field.key.trim(),
          label: field.label.trim(),
          placeholder: field.placeholder?.trim()
            ? field.placeholder.trim()
            : undefined,
          required: field.required ?? false,
          copyEnabled: field.copyEnabled ?? false,
          prependUrl: field.prependUrl?.trim()
            ? field.prependUrl.trim()
            : undefined,
          trimWhitespace: field.trimWhitespace !== false,
        })),
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
        <HostEventForm
          form={form}
          onSubmit={onSubmit}
          submitLabel="Create Event"
        submittingLabel="Creating Event..."
        isSubmitting={form.formState.isSubmitting}
        flyerStorageId={flyerStorageId}
        onFlyerChange={(value) =>
          form.setValue("flyerStorageId", value, { shouldDirty: true })
        }
        eventIconStorageId={eventIconStorageId}
        onEventIconChange={(value) =>
          form.setValue("customIconStorageId", value, { shouldDirty: true })
        }
        listsSection={
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground">
                ACCESS LISTS & PASSWORDS
              </h3>
              <div className="space-y-3">
                {lists.map((list, idx) => (
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
                        value={list.listKey}
                        onChange={(event) =>
                          setList(idx, "listKey", event.target.value)
                        }
                      />
                    </div>
                    <div className="flex w-full flex-col">
                      <label className="text-xs font-medium text-muted-foreground">
                        Password
                      </label>
                      <Input
                        placeholder="Enter secure password"
                        value={list.password}
                        onChange={(event) =>
                          setList(idx, "password", event.target.value)
                        }
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
          }
          customFieldsSection={
            <CustomFieldsEditor onChange={setCustomFields} />
          }
        />
      </div>
    </div>
  );
}
