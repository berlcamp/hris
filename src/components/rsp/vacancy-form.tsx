"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { createVacancy, updateVacancy } from "@/lib/actions/rsp-actions";
import type {
  VacantPlantillaItem,
  RspVacancyDetail,
} from "@/lib/actions/rsp-actions";
import { vacancyFormSchema } from "@/lib/validations/rsp-schema";

interface VacancyFormProps {
  /** Vacant + funded plantilla items without a live recruitment (create mode). */
  plantillaItems: VacantPlantillaItem[];
  /** When set, the form edits this vacancy instead of creating one. */
  vacancy?: RspVacancyDetail;
}

interface FormState {
  plantilla_id: string;
  item_number: string;
  position_title: string;
  organizational_unit: string;
  place_of_assignment: string;
  salary_grade: string;
  monthly_salary: string;
  qs_education: string;
  qs_training: string;
  qs_training_hours: string;
  qs_experience: string;
  qs_experience_years: string;
  qs_eligibility: string;
  remarks: string;
}

export function VacancyForm({ plantillaItems, vacancy }: VacancyFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [form, setForm] = useState<FormState>({
    plantilla_id: vacancy?.plantilla_id ?? "",
    item_number: vacancy?.item_number ?? "",
    position_title: vacancy?.position_title ?? "",
    organizational_unit: vacancy?.organizational_unit ?? "",
    place_of_assignment: vacancy?.place_of_assignment ?? "",
    salary_grade: vacancy?.salary_grade?.toString() ?? "",
    monthly_salary: vacancy?.monthly_salary?.toString() ?? "",
    qs_education: vacancy?.qs_education ?? "",
    qs_training: vacancy?.qs_training ?? "",
    qs_training_hours: vacancy?.qs_training_hours?.toString() ?? "",
    qs_experience: vacancy?.qs_experience ?? "",
    qs_experience_years: vacancy?.qs_experience_years?.toString() ?? "",
    qs_eligibility: vacancy?.qs_eligibility ?? "",
    remarks: vacancy?.remarks ?? "",
  });

  const selectedItem = useMemo(
    () => plantillaItems.find((i) => i.id === form.plantilla_id) ?? null,
    [plantillaItems, form.plantilla_id]
  );

  const set = (field: keyof FormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handlePickItem = (item: VacantPlantillaItem) => {
    setForm((f) => ({
      ...f,
      plantilla_id: item.id,
      item_number: item.item_number ?? "",
      position_title: item.position_title ?? "",
      organizational_unit: item.organizational_unit ?? "",
      salary_grade: item.salary_grade?.toString() ?? "",
      qs_eligibility: f.qs_eligibility || (item.civil_service_eligibility ?? ""),
    }));
    setPickerOpen(false);
  };

  const handleSubmit = async () => {
    const parsed = vacancyFormSchema.safeParse({
      ...form,
      salary_grade: form.salary_grade === "" ? null : form.salary_grade,
      monthly_salary: form.monthly_salary,
      qs_training_hours: form.qs_training_hours,
      qs_experience_years: form.qs_experience_years,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid form data");
      return;
    }

    setLoading(true);
    const result = vacancy
      ? await updateVacancy(vacancy.id, parsed.data)
      : await createVacancy(parsed.data);
    if ("error" in result && result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }
    if (vacancy) {
      toast.success("Vacancy updated.");
      router.push(`/rsp/${vacancy.id}`);
    } else {
      toast.success(
        "Vacancy created as draft with default HRMPSB assessment criteria."
      );
      const id = "data" in result ? result.data?.id : undefined;
      router.push(id ? `/rsp/${id}` : "/rsp");
    }
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Position</CardTitle>
          <CardDescription>
            Select the vacant, funded plantilla item to be published. Position
            details are copied as a snapshot and stay editable until the
            vacancy is closed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Plantilla Item *</Label>
            {vacancy ? (
              <p className="text-sm font-medium">
                {vacancy.item_number} — {vacancy.position_title}
              </p>
            ) : (
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    />
                  }
                >
                  {selectedItem
                    ? `${selectedItem.item_number} — ${selectedItem.position_title}`
                    : "Select vacant plantilla item..."}
                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search by item number or position..." />
                    <CommandList>
                      <CommandEmpty>
                        No vacant funded plantilla items available.
                      </CommandEmpty>
                      <CommandGroup>
                        {plantillaItems.map((item) => (
                          <CommandItem
                            key={item.id}
                            value={`${item.item_number} ${item.position_title} ${item.organizational_unit}`}
                            onSelect={() => handlePickItem(item)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.plantilla_id === item.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            <div>
                              <p className="font-medium">
                                {item.item_number} — {item.position_title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.organizational_unit ?? "—"}
                                {item.salary_grade
                                  ? ` · SG ${item.salary_grade}`
                                  : ""}
                              </p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </div>
          <div className="space-y-2">
            <Label>Item Number *</Label>
            <Input
              value={form.item_number}
              onChange={(e) => set("item_number")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Position Title *</Label>
            <Input
              value={form.position_title}
              onChange={(e) => set("position_title")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Office / Organizational Unit</Label>
            <Input
              value={form.organizational_unit}
              onChange={(e) => set("organizational_unit")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Place of Assignment</Label>
            <Input
              value={form.place_of_assignment}
              onChange={(e) => set("place_of_assignment")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Salary Grade</Label>
            <Input
              type="number"
              min={1}
              max={33}
              value={form.salary_grade}
              onChange={(e) => set("salary_grade")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Monthly Salary (₱)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.monthly_salary}
              onChange={(e) => set("monthly_salary")(e.target.value)}
              placeholder="Auto-filled from salary grade table if blank"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualification Standards</CardTitle>
          <CardDescription>
            Minimum requirements per the CSC Qualification Standards manual.
            Applicants are screened against these during initial evaluation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Education</Label>
            <Textarea
              rows={2}
              value={form.qs_education}
              onChange={(e) => set("qs_education")(e.target.value)}
              placeholder="e.g. Bachelor's degree relevant to the job"
            />
          </div>
          <div className="space-y-2">
            <Label>Training</Label>
            <Textarea
              rows={2}
              value={form.qs_training}
              onChange={(e) => set("qs_training")(e.target.value)}
              placeholder="e.g. 4 hours of relevant training"
            />
          </div>
          <div className="space-y-2">
            <Label>Training Hours</Label>
            <Input
              type="number"
              min={0}
              value={form.qs_training_hours}
              onChange={(e) => set("qs_training_hours")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Experience</Label>
            <Textarea
              rows={2}
              value={form.qs_experience}
              onChange={(e) => set("qs_experience")(e.target.value)}
              placeholder="e.g. 1 year of relevant experience"
            />
          </div>
          <div className="space-y-2">
            <Label>Experience (years)</Label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={form.qs_experience_years}
              onChange={(e) => set("qs_experience_years")(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Eligibility</Label>
            <Textarea
              rows={2}
              value={form.qs_eligibility}
              onChange={(e) => set("qs_eligibility")(e.target.value)}
              placeholder="e.g. Career Service (Professional) Second Level Eligibility"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Remarks</Label>
            <Textarea
              rows={2}
              value={form.remarks}
              onChange={(e) => set("remarks")(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={
            loading ||
            !form.plantilla_id ||
            !form.item_number.trim() ||
            !form.position_title.trim()
          }
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {vacancy ? "Save Changes" : "Create Draft Vacancy"}
        </Button>
      </div>
    </div>
  );
}
