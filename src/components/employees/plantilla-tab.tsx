"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  updatePlantilla,
  type PlantillaRecord,
  type PlantillaUpdateInput,
} from "@/lib/actions/plantilla-actions";

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value?: string | null;
  highlight?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "col-span-2 text-sm font-medium",
          highlight && "text-primary font-semibold"
        )}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !value && "text-muted-foreground"
              )}
            />
          }
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(new Date(value), "MMMM d, yyyy") : "Select date"}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value ? new Date(value) : undefined}
            onSelect={(date) =>
              onChange(date ? format(date, "yyyy-MM-dd") : null)
            }
            captionLayout="dropdown"
            fromYear={1970}
            toYear={new Date().getFullYear()}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface PlantillaTabProps {
  plantilla: PlantillaRecord;
  employeeId: string;
  canEdit: boolean;
}

export function PlantillaTab({ plantilla: initial, employeeId, canEdit }: PlantillaTabProps) {
  const [plantilla, setPlantilla] = useState(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [form, setForm] = useState<PlantillaUpdateInput>({
    item_number: plantilla.item_number,
    position_title: plantilla.position_title,
    organizational_unit: plantilla.organizational_unit,
    salary_grade: plantilla.salary_grade,
    step: plantilla.step,
    authorized_annual_salary: plantilla.authorized_annual_salary,
    actual_annual_salary: plantilla.actual_annual_salary,
    area_code: plantilla.area_code,
    area_type: plantilla.area_type,
    level: plantilla.level,
    level_supplemental: plantilla.level_supplemental,
    date_of_original_appointment: plantilla.date_of_original_appointment,
    date_of_last_promotion_appointment: plantilla.date_of_last_promotion_appointment,
    status: plantilla.status,
    is_vacant: plantilla.is_vacant,
    is_funded: plantilla.is_funded,
    vice: plantilla.vice,
    civil_service_eligibility: plantilla.civil_service_eligibility,
    comment_annotation: plantilla.comment_annotation,
    gsis_bp_number: plantilla.gsis_bp_number,
    tin: plantilla.tin,
    pwd: plantilla.pwd,
    indigenous_people: plantilla.indigenous_people,
    solo_parent: plantilla.solo_parent,
  });

  const handleSave = async () => {
    setSaving(true);
    const result = await updatePlantilla(plantilla.id, employeeId, form);
    setSaving(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    // Optimistically update displayed data
    setPlantilla((prev) => ({ ...prev, ...form, updated_at: new Date().toISOString() }));
    toast.success("Plantilla record updated.");
    setOpen(false);
  };

  const fmtDate = (d: string | null) =>
    d ? format(new Date(d), "MMMM d, yyyy") : null;

  const fmtCurrency = (n: number | null) =>
    n != null
      ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Official CSC plantilla record. Salary history is the primary NOSI basis; these appointment dates are used only when no qualifying salary history exists.
          </p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm" />}>
              <Pencil className="h-4 w-4" />
              Edit
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Plantilla Record</DialogTitle>
              </DialogHeader>

              <div className="space-y-6 py-2">
                {/* Appointment Dates — most critical */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Appointment Dates (NOSI fallback)</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DatePickerField
                      label="Date of Original Appointment"
                      value={form.date_of_original_appointment ?? null}
                      onChange={(v) => setForm((f) => ({ ...f, date_of_original_appointment: v }))}
                    />
                    <DatePickerField
                      label="Date of Last Promotion"
                      value={form.date_of_last_promotion_appointment ?? null}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, date_of_last_promotion_appointment: v }))
                      }
                    />
                  </div>
                </div>

                {/* Position */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Position</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Item Number</Label>
                      <Input
                        value={form.item_number ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, item_number: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Position Title</Label>
                      <Input
                        value={form.position_title ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, position_title: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Organizational Unit</Label>
                      <Input
                        value={form.organizational_unit ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, organizational_unit: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Input
                        value={form.status ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Salary Grade</Label>
                      <Input
                        type="number"
                        min={1}
                        max={33}
                        value={form.salary_grade ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, salary_grade: e.target.value ? Number(e.target.value) : null }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Step</Label>
                      <Input
                        type="number"
                        min={1}
                        max={8}
                        value={form.step ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, step: e.target.value ? Number(e.target.value) : null }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Authorized Annual Salary</Label>
                      <Input
                        type="number"
                        value={form.authorized_annual_salary ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            authorized_annual_salary: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Actual Annual Salary</Label>
                      <Input
                        type="number"
                        value={form.actual_annual_salary ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            actual_annual_salary: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Vice (Predecessor)</Label>
                      <Input
                        value={form.vice ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, vice: e.target.value || null }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Area / Level */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Area / Level</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Area Code</Label>
                      <Input
                        value={form.area_code ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, area_code: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Area Type</Label>
                      <Input
                        value={form.area_type ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, area_type: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Level</Label>
                      <Input
                        value={form.level ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, level: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Level (Supplemental)</Label>
                      <Input
                        value={form.level_supplemental ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, level_supplemental: e.target.value || null }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Supplemental */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Supplemental Information</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Civil Service Eligibility</Label>
                      <Input
                        value={form.civil_service_eligibility ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, civil_service_eligibility: e.target.value || null }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>GSIS BP Number</Label>
                      <Input
                        value={form.gsis_bp_number ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, gsis_bp_number: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>TIN</Label>
                      <Input
                        value={form.tin ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>PWD</Label>
                      <Input
                        value={form.pwd ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, pwd: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Indigenous People</Label>
                      <Input
                        value={form.indigenous_people ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, indigenous_people: e.target.value || null }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Solo Parent</Label>
                      <Input
                        value={form.solo_parent ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, solo_parent: e.target.value || null }))}
                      />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label>Comment / Annotation</Label>
                    <Textarea
                      rows={2}
                      value={form.comment_annotation ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, comment_annotation: e.target.value || null }))
                      }
                    />
                  </div>
                </div>

                {/* Flags */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Flags</h3>
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_vacant ?? false}
                        onChange={(e) => setForm((f) => ({ ...f, is_vacant: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      Vacant
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.is_funded ?? true}
                        onChange={(e) => setForm((f) => ({ ...f, is_funded: e.target.checked }))}
                        className="h-4 w-4"
                      />
                      Funded
                    </label>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Appointment Dates — highlighted, most important */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-base">Appointment Dates</CardTitle>
            <CardDescription>NOSI fallback when salary history has no basis record</CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow
              label="Date of Original Appointment"
              value={fmtDate(plantilla.date_of_original_appointment)}
              highlight
            />
            <InfoRow
              label="Date of Last Promotion"
              value={fmtDate(plantilla.date_of_last_promotion_appointment)}
              highlight
            />
            <InfoRow label="Status" value={plantilla.status} />
            <InfoRow label="Vice (Predecessor)" value={plantilla.vice} />
            <InfoRow
              label="Vacant"
              value={plantilla.is_vacant ? "Yes" : "No"}
            />
            <InfoRow
              label="Funded"
              value={plantilla.is_funded ? "Yes" : "No"}
            />
          </CardContent>
        </Card>

        {/* Position */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Position Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Item Number" value={plantilla.item_number} />
            <InfoRow label="Position Title" value={plantilla.position_title} />
            <InfoRow label="Organizational Unit" value={plantilla.organizational_unit} />
            <InfoRow
              label="Salary Grade"
              value={plantilla.salary_grade != null ? String(plantilla.salary_grade) : null}
            />
            <InfoRow
              label="Step"
              value={plantilla.step != null ? String(plantilla.step) : null}
            />
            <InfoRow
              label="Authorized Annual Salary"
              value={fmtCurrency(plantilla.authorized_annual_salary)}
            />
            <InfoRow
              label="Actual Annual Salary"
              value={fmtCurrency(plantilla.actual_annual_salary)}
            />
          </CardContent>
        </Card>

        {/* Area / Level */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Area / Level</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Area Code" value={plantilla.area_code} />
            <InfoRow label="Area Type" value={plantilla.area_type} />
            <InfoRow label="Level" value={plantilla.level} />
            <InfoRow label="Level (Supplemental)" value={plantilla.level_supplemental} />
          </CardContent>
        </Card>

        {/* Supplemental */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Supplemental Information</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            <InfoRow label="Civil Service Eligibility" value={plantilla.civil_service_eligibility} />
            <InfoRow label="GSIS BP Number" value={plantilla.gsis_bp_number} />
            <InfoRow label="TIN" value={plantilla.tin} />
            <InfoRow label="PWD" value={plantilla.pwd} />
            <InfoRow label="Indigenous People" value={plantilla.indigenous_people} />
            <InfoRow label="Solo Parent" value={plantilla.solo_parent} />
            {plantilla.comment_annotation && (
              <InfoRow label="Comment / Annotation" value={plantilla.comment_annotation} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
