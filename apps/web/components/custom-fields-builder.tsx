"use client";
import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type CustomFieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

export function CustomFieldsBuilderForm() {
  const [fields, setFields] = React.useState<CustomFieldDef[]>([]);
  const set = (index: number, key: keyof CustomFieldDef, value: string | boolean) =>
    setFields((array) => array.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
  const remove = (index: number) => setFields((array) => array.filter((_, idx) => idx !== index));
  const add = () => setFields((array) => [...array, { key: "", label: "", placeholder: "", required: false }]);
  return (
    <div className="rounded border p-3 space-y-2">
      <div className="font-medium text-sm">Custom RSVP Fields</div>
      {fields.map((field, index) => (
        <div key={index} className="grid grid-cols-4 gap-2 items-center">
          <Input placeholder="key (e.g. instagram)" value={field.key} onChange={(e) => set(index, "key", e.target.value.trim())} />
          <Input placeholder="Label" value={field.label} onChange={(e) => set(index, "label", e.target.value.trim())} />
          <Input placeholder="Placeholder" value={field.placeholder || ""} onChange={(e) => set(index, "placeholder", e.target.value.trim())} />
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={!!field.required} onChange={(e) => set(index, "required", e.target.checked)} /> Required
          </label>
          <div className="col-span-4">
            <Button type="button" size="sm" variant="outline" onClick={() => remove(index)}>Remove</Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>Add field</Button>
      <input type="hidden" name="customFields" value={JSON.stringify(fields)} />
    </div>
  );
}

export function CustomFieldsEditor({ initial, onChange }: { initial?: CustomFieldDef[]; onChange: (fields: CustomFieldDef[]) => void }) {
  const [fields, setFields] = React.useState<CustomFieldDef[]>(initial ?? []);
  React.useEffect(() => { onChange(fields); }, [fields]);
  const set = (index: number, key: keyof CustomFieldDef, value: string | boolean) =>
    setFields((array) => array.map((item, idx) => (idx === index ? { ...item, [key]: value } : item)));
  const remove = (index: number) => setFields((array) => array.filter((_, idx) => idx !== index));
  const add = () => setFields((array) => [...array, { key: "", label: "", placeholder: "", required: false }]);
  return (
    <div className="rounded border p-3 space-y-2">
      <div className="font-medium text-sm">Custom RSVP Fields</div>
      {fields.map((field, index) => (
        <div key={index} className="grid grid-cols-4 gap-2 items-center">
          <Input placeholder="key (e.g. instagram)" value={field.key} onChange={(e) => set(index, "key", e.target.value.trim())} />
          <Input placeholder="Label" value={field.label} onChange={(e) => set(index, "label", e.target.value.trim())} />
          <Input placeholder="Placeholder" value={field.placeholder || ""} onChange={(e) => set(index, "placeholder", e.target.value.trim())} />
          <label className="text-xs flex items-center gap-2">
            <input type="checkbox" checked={!!field.required} onChange={(e) => set(index, "required", e.target.checked)} /> Required
          </label>
          <div className="col-span-4">
            <Button type="button" size="sm" variant="outline" onClick={() => remove(index)}>Remove</Button>
          </div>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>Add field</Button>
    </div>
  );
}

