// Resolves the position title to display for an employee.
//
// Priority:
//   1. Plantilla `position_title` (if the employee has any plantilla row),
//      since for plantilla employees the official CSC plantilla item is the
//      authoritative title.
//   2. `positions.title` (the in-app positions table).
//   3. null — caller decides the placeholder.
//
// Accepts a tolerant shape because the query sites pull plantilla either as
// an embedded array (default PostgREST one-to-many) or as a single object,
// and may not select positions at all.

type PlantillaRef = { position_title: string | null } | null | undefined;
type PositionRef = { title: string | null } | null | undefined;

export function getEffectivePosition(emp: {
  plantilla?: PlantillaRef | PlantillaRef[];
  positions?: PositionRef;
}): string | null {
  const plantillaRow = Array.isArray(emp.plantilla)
    ? emp.plantilla.find((p) => p && p.position_title) ?? emp.plantilla[0] ?? null
    : emp.plantilla ?? null;
  const fromPlantilla = plantillaRow?.position_title ?? null;
  if (fromPlantilla) return fromPlantilla;
  return emp.positions?.title ?? null;
}
