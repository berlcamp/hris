"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { updateSystemSettings } from "@/lib/actions/settings-actions";
import type { SystemSettings } from "@/lib/actions/settings-actions";

interface SystemSettingsFormProps {
  settings: SystemSettings;
}

export function SystemSettingsForm({ settings }: SystemSettingsFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [form, setForm] = useState<SystemSettings>(settings);

  const update = (key: keyof SystemSettings, value: string | number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveSection = async (section: string, keys: (keyof SystemSettings)[]) => {
    setLoading(section);
    try {
      const partial: Partial<SystemSettings> = {};
      for (const key of keys) {
        (partial as Record<string, unknown>)[key] = form[key];
      }
      await updateSystemSettings(partial);
      toast.success(`${section} settings saved`);
      router.refresh();
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* LGU Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">LGU Information</CardTitle>
          <CardDescription>
            Name and address used in PDF report headers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>LGU Name</Label>
            <Input
              value={form.lgu_name}
              onChange={(e) => update("lgu_name", e.target.value)}
              placeholder="Local Government Unit"
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={form.lgu_address}
              onChange={(e) => update("lgu_address", e.target.value)}
              placeholder="Municipality/City, Province"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => handleSaveSection("LGU Info", ["lgu_name", "lgu_address"])}
              disabled={loading === "LGU Info"}
            >
              {loading === "LGU Info" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Work Hours */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Standard Work Hours</CardTitle>
          <CardDescription>
            Used for late/undertime calculation in attendance tracking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>AM Time In</Label>
              <Input
                type="time"
                value={form.standard_am_in}
                onChange={(e) => update("standard_am_in", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>AM Time Out</Label>
              <Input
                type="time"
                value={form.standard_am_out}
                onChange={(e) => update("standard_am_out", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>PM Time In</Label>
              <Input
                type="time"
                value={form.standard_pm_in}
                onChange={(e) => update("standard_pm_in", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>PM Time Out</Label>
              <Input
                type="time"
                value={form.standard_pm_out}
                onChange={(e) => update("standard_pm_out", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Grace Period (minutes)</Label>
            <Input
              type="number"
              min="0"
              max="30"
              value={form.grace_period_minutes}
              onChange={(e) => update("grace_period_minutes", Number(e.target.value))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Minutes allowed after standard time-in before marking as late.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() =>
                handleSaveSection("Work Hours", [
                  "standard_am_in",
                  "standard_am_out",
                  "standard_pm_in",
                  "standard_pm_out",
                  "grace_period_minutes",
                ])
              }
              disabled={loading === "Work Hours"}
            >
              {loading === "Work Hours" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* NOSI Eligibility */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">NOSI Eligibility</CardTitle>
          <CardDescription>
            Minimum years in current step before qualifying for step increment.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Required Years in Step</Label>
            <Input
              type="number"
              min="1"
              max="10"
              value={form.nosi_eligibility_years}
              onChange={(e) => update("nosi_eligibility_years", Number(e.target.value))}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              CSC standard: 3 years. Employees must serve this many years at
              their current step before becoming eligible.
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() =>
                handleSaveSection("NOSI", ["nosi_eligibility_years"])
              }
              disabled={loading === "NOSI"}
            >
              {loading === "NOSI" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Leave Credits */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leave Credit Provisioning</CardTitle>
          <CardDescription>
            Annual leave credits provisioned to each active employee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Vacation Leave (VL) Credits/Year</Label>
              <Input
                type="number"
                min="0"
                max="30"
                value={form.vl_annual_credits}
                onChange={(e) => update("vl_annual_credits", Number(e.target.value))}
                className="w-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Sick Leave (SL) Credits/Year</Label>
              <Input
                type="number"
                min="0"
                max="30"
                value={form.sl_annual_credits}
                onChange={(e) => update("sl_annual_credits", Number(e.target.value))}
                className="w-32"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            CSC standard: 15 days VL + 15 days SL per year (1.25 credits/month
            each).
          </p>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() =>
                handleSaveSection("Leave Credits", [
                  "vl_annual_credits",
                  "sl_annual_credits",
                ])
              }
              disabled={loading === "Leave Credits"}
            >
              {loading === "Leave Credits" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
