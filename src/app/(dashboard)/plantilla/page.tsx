import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/actions/auth-actions";
import { getAllPlantilla } from "@/lib/actions/plantilla-actions";
import { PlantillaTable } from "@/components/plantilla/plantilla-table";

export default async function PlantillaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["super_admin", "hr_admin"].includes(user.role)) redirect("/dashboard");

  const records = await getAllPlantilla();

  const orgUnits = [...new Set(records.map((r) => r.organizational_unit).filter(Boolean))] as string[];
  const orgUnitOptions = orgUnits.sort().map((u) => ({ label: u, value: u }));

  const total = records.length;
  const filled = records.filter((r) => !r.is_vacant).length;
  const vacant = records.filter((r) => r.is_vacant).length;
  const unfunded = records.filter((r) => !r.is_funded).length;

  return (
    <div className="flex flex-col gap-6 h-[calc(100svh-6.5rem)] overflow-hidden">
      <div className="flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Plantilla</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Official plantilla roster including vacant and unfunded positions.
          </p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 shrink-0">
        {[
          { label: "Total Items", value: total },
          { label: "Filled", value: filled },
          { label: "Vacant", value: vacant },
          { label: "Unfunded", value: unfunded },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border bg-card px-4 py-3 space-y-0.5"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      <PlantillaTable data={records} orgUnitOptions={orgUnitOptions} />
    </div>
  );
}
