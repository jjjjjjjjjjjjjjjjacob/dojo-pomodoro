"use client";
import React, { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { toast } from "sonner";
import {
  CustomFieldsEditor,
  type CustomFieldDef,
} from "@/components/custom-fields-builder";
import { useForm } from "react-hook-form";
import { HostEventForm } from "@/components/host-event-form";
import {
  Event,
  EditEventFormData,
  ListCredentialEdit,
  CredentialResponse,
  ApplicationError,
} from "@/lib/types";
import { createTimestamp } from "@/lib/date-utils";
import {
  EVENT_THEME_DEFAULT_BACKGROUND_COLOR,
  EVENT_THEME_DEFAULT_TEXT_COLOR,
  normalizeHexColorInput,
} from "@/lib/event-theme";

export default function EditEventDialog({
  steve,
  showTrigger = true,
  event,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}: {
  steve?: string;
  showTrigger?: boolean;
  event: Event;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOnOpenChange || setInternalOpen;
  const defaultDate = React.useMemo(() => {
    try {
      const date = new Date(event.eventDate);
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return "";
    }
  }, [event.eventDate]);
  const defaultTime = React.useMemo(() => {
    try {
      const date = new Date(event.eventDate);
      const hours = String(date.getUTCHours()).padStart(2, "0");
      const minutes = String(date.getUTCMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    } catch {
      return "";
    }
  }, [event.eventDate]);
  const defaultTimezone = React.useMemo(
    () => event.eventTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    [event.eventTimezone],
  );
  const normalizedEventBackgroundColor =
    normalizeHexColorInput(event.themeBackgroundColor) ??
    EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
  const normalizedEventTextColor =
    normalizeHexColorInput(event.themeTextColor) ??
    EVENT_THEME_DEFAULT_TEXT_COLOR;
  const form = useForm<EditEventFormData>({
    defaultValues: {
      name: event.name || "",
      secondaryTitle: event.secondaryTitle ?? "",
      hosts: (event.hosts || []).join(", "),
      location: event.location || "",
      flyerStorageId: event.flyerStorageId ?? null,
      eventDate: defaultDate,
      eventTime: defaultTime,
      eventTimezone: defaultTimezone,
      maxAttendees: event.maxAttendees ?? 1,
      themeBackgroundColor: normalizedEventBackgroundColor,
      themeTextColor: normalizedEventTextColor,
    },
  });
  const [flyerStorageId, setFlyerStorageId] = React.useState<string | null>(
    event.flyerStorageId ?? null,
  );
  const [saving, setSaving] = React.useState(false);
  const update = useAction(api.eventsNode.update);
  const creds = useQuery(
    api.credentials.getCredsForEvent,
    open ? { eventId: event._id } : "skip",
  ) as CredentialResponse[] | undefined;
  const [lists, setLists] = React.useState<ListCredentialEdit[]>([]);
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>(
    event.customFields ?? [],
  );

  useEffect(() => {
    if (open && creds) {
      setLists(
        creds.map((credential) => ({
          id: credential._id,
          listKey: credential.listKey,
          password: "",
        })),
      );
    }
  }, [open, creds]);

  const addList = () =>
    setLists((array) => [...array, { listKey: "", password: "" }]);
  const setList = (index: number, key: "listKey" | "password", value: string) =>
    setLists((array) =>
      array.map((item, position) =>
        position === index ? { ...item, [key]: value } : item,
      ),
    );
  const removeList = (index: number) =>
    setLists((array) => array.filter((_, position) => position !== index));

  const handleSubmit = async (values: EditEventFormData) => {
    try {
      setSaving(true);
      const patch: Partial<Event> = {};
      const trimmedName = values.name.trim();
      if (trimmedName && trimmedName !== event.name) {
        patch.name = trimmedName;
      }
      const trimmedSecondaryTitle = values.secondaryTitle?.trim() ?? "";
      if (trimmedSecondaryTitle !== (event.secondaryTitle ?? "")) {
        patch.secondaryTitle = trimmedSecondaryTitle || undefined;
      }
      const hostArray = values.hosts
        .split(",")
        .map((host) => host.trim())
        .filter(Boolean);
      if (JSON.stringify(hostArray) !== JSON.stringify(event.hosts)) {
        patch.hosts = hostArray;
      }
      const trimmedLocation = values.location.trim();
      if (trimmedLocation && trimmedLocation !== event.location) {
        patch.location = trimmedLocation;
      }
      if ((flyerStorageId ?? undefined) !== (event.flyerStorageId ?? undefined)) {
        patch.flyerStorageId = (flyerStorageId as Id<"_storage">) ?? undefined;
      }
      if (
        values.maxAttendees !== undefined &&
        values.maxAttendees !== (event.maxAttendees ?? 1)
      ) {
        patch.maxAttendees = values.maxAttendees;
      }
      const nextThemeBackgroundColor =
        normalizeHexColorInput(values.themeBackgroundColor) ??
        EVENT_THEME_DEFAULT_BACKGROUND_COLOR;
      if (nextThemeBackgroundColor !== normalizedEventBackgroundColor) {
        patch.themeBackgroundColor = nextThemeBackgroundColor;
      }
      const nextThemeTextColor =
        normalizeHexColorInput(values.themeTextColor) ??
        EVENT_THEME_DEFAULT_TEXT_COLOR;
      if (nextThemeTextColor !== normalizedEventTextColor) {
        patch.themeTextColor = nextThemeTextColor;
      }
      const timezoneValue = values.eventTimezone || defaultTimezone;
      const computedTimestamp =
        values.eventDate && (values.eventTime || defaultTime)
          ? createTimestamp(
              values.eventDate,
              values.eventTime || defaultTime || "19:00",
              timezoneValue,
            )
          : undefined;
      if (
        computedTimestamp &&
        Number.isFinite(computedTimestamp) &&
        computedTimestamp !== event.eventDate
      ) {
        patch.eventDate = computedTimestamp;
      }
      if (timezoneValue && timezoneValue !== event.eventTimezone) {
        patch.eventTimezone = timezoneValue;
      }
      const outgoingLists = lists.map((list) => ({
        id: list.id as Id<"listCredentials"> | undefined,
        listKey: list.listKey,
        password: list.password || undefined,
      }));
      patch.customFields = customFields.map((field) => ({
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
      }));
      await update({ eventId: event._id, patch, lists: outgoingLists });
      toast.success("Event updated");
      setOpen(false);
    } catch (error: unknown) {
      const errorDetails = error as ApplicationError | Error;
      toast.error(errorDetails?.message || "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!externalOpen && showTrigger && (
        <DialogTrigger asChild>
          <button className="text-sm px-2 py-1 border rounded">Edit</button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>
            Update details and flyer. Password lists are managed on creation.
          </DialogDescription>
        </DialogHeader>
        <HostEventForm
          form={form}
          onSubmit={handleSubmit}
          submitLabel="Save"
          submittingLabel="Saving..."
          isSubmitting={saving}
          flyerStorageId={flyerStorageId}
          onFlyerChange={(value) => {
            setFlyerStorageId(value);
            form.setValue("flyerStorageId", value, { shouldDirty: true });
          }}
          listsSection={
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <h4 className="font-medium text-sm text-muted-foreground">
                ACCESS LISTS & PASSWORDS
              </h4>
              <div className="space-y-3">
                {lists.map((listPassword, index) => (
                  <div
                    key={listPassword.id ?? index}
                    className="flex gap-3 items-end p-3 rounded border bg-muted/20"
                  >
                    <div className="flex flex-col w-full">
                      <label className="text-xs font-medium text-muted-foreground">
                        List Name
                      </label>
                      <Input
                        placeholder="e.g. vip, general, backstage"
                        value={listPassword.listKey}
                        onChange={(event) =>
                          setList(index, "listKey", event.target.value.trim())
                        }
                      />
                    </div>
                    <div className="flex flex-col w-full">
                      <label className="text-xs font-medium text-muted-foreground">
                        New Password
                      </label>
                      <Input
                        placeholder="Leave blank to keep current"
                        value={listPassword.password}
                        onChange={(event) =>
                          setList(index, "password", event.target.value.trim())
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removeList(index)}
                      className="w-16 h-10"
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
            <CustomFieldsEditor
              initial={event.customFields ?? []}
              onChange={setCustomFields}
            />
          }
          footer={
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          }
        />
      </DialogContent>
    </Dialog>
  );
}
