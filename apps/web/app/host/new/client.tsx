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
import { EventFormData } from "@/lib/types";

type ListRow = { listKey: string; password: string };

function validateCreate(values: EventFormData, lists: ListRow[]): string[] {
  const errs: string[] = [];
  if (!values.name?.trim()) errs.push("Name is required");
  if (!values.hosts?.trim()) errs.push("Hosts are required");
  if (!values.location?.trim()) errs.push("Location is required");
  if (!values.eventDate) errs.push("Event date is required");
  const filtered = lists.filter(
    (list) => list.listKey?.trim() && list.password?.trim(),
  );
  if (filtered.length === 0) errs.push("Add at least one list/password");
  return errs;
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
      maxAttendees: 1,
    },
  });

  const flyerStorageId = form.watch("flyerStorageId") ?? null;
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
    const errs = validateCreate(values, lists);
    if (errs.length) {
      errs.forEach((e) => toast.error(e));
      return;
    }
    try {
      const hostArr = values.hosts
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const dt = createTimestamp(
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
      await create({
        name: values.name.trim(),
        secondaryTitle: trimmedSecondaryTitle || undefined,
        hosts: hostArr,
        location: values.location.trim(),
        flyerStorageId: values.flyerStorageId || undefined,
        eventDate: dt,
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
      });
      toast.success("Event created");
      router.replace("/host/events?created=1");
    } catch (e: any) {
      toast.error(e?.message || "Failed to create event");
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
                      onChange={(e) => setList(idx, "listKey", e.target.value)}
                    />
                  </div>
                  <div className="flex w-full flex-col">
                    <label className="text-xs font-medium text-muted-foreground">
                      Password
                    </label>
                    <Input
                      placeholder="Enter secure password"
                      value={list.password}
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
          }
          customFieldsSection={
            <CustomFieldsEditor onChange={setCustomFields} />
          }
        />
      </div>
    </div>
  );
}
