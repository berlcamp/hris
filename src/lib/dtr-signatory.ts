import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Resolves the printed-name / title block at the foot of a printable DTR.
//
// Rules (driven by employees.is_department_head + the "effective" department,
// which is the detailed department when set, otherwise the home department):
//   1. effective department name/code contains "CMO"    -> City Mayor
//   2. else employee heads CADMO (City Administrator's
//      Office) — the head *is* the City Administrator, so
//      their own DTR is signed by the City Mayor           -> City Mayor
//   3. else employee is a department head               -> City Administrator
//   4. else                                             -> that department's head
//
// The City Mayor and City Administrator names come from env so they can be
// updated without a code change.

export interface DtrSignatory {
  /** Printed name above the signature line (already upper-cased). */
  name: string;
  /** Title printed below the line, e.g. "City Mayor". */
  title: string;
}

export interface SignatoryDepartment {
  id: string;
  name: string;
  code: string;
}

export interface SignatoryInput {
  id: string;
  is_department_head: boolean;
  /** Home/plantilla department. */
  homeDept: SignatoryDepartment | null;
  /** Department the employee is detailed to, if any. */
  detailedDept: SignatoryDepartment | null;
}

const CITY_MAYOR = process.env.NEXT_PUBLIC_CITY_MAYOR ?? "";
const CITY_ADMINISTRATOR = process.env.NEXT_PUBLIC_CITY_ADMINISTRATOR ?? "";

function effectiveDept(e: SignatoryInput): SignatoryDepartment | null {
  return e.detailedDept ?? e.homeDept;
}

function isCmo(dept: SignatoryDepartment | null): boolean {
  if (!dept) return false;
  return `${dept.name} ${dept.code}`.toUpperCase().includes("CMO");
}

// The City Administrator's Office. Its head is the City Administrator, who
// cannot sign their own DTR — the City Mayor signs instead.
function isCadmo(dept: SignatoryDepartment | null): boolean {
  if (!dept) return false;
  return `${dept.name} ${dept.code}`.toUpperCase().includes("CADMO");
}

function formatHeadName(e: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
}): string {
  const mi = e.middle_name?.trim()
    ? `${e.middle_name.trim().charAt(0).toUpperCase()}.`
    : "";
  return [e.first_name, mi, e.last_name, e.suffix]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
}

/**
 * Computes the DTR signatory for each employee in one batched query for the
 * department-head names. Returns a map keyed by employee id.
 */
export async function resolveSignatories(
  supabase: SupabaseClient,
  employees: SignatoryInput[],
): Promise<Map<string, DtrSignatory>> {
  // Departments whose head's name we actually need: employees who are not a
  // head themselves and whose effective department is not the CMO.
  const deptIdsNeedingHead = new Set<string>();
  for (const e of employees) {
    const dept = effectiveDept(e);
    if (!dept || isCmo(dept) || e.is_department_head) continue;
    deptIdsNeedingHead.add(dept.id);
  }

  // The head of a department is resolved from departments.head_employee_id (the
  // single source of truth, set in Departments settings). The pointer can name
  // an employee whose home department is a different one, so one employee may be
  // the head of several departments. When no employee head is set, fall back to
  // the department's free-text head_custom_name.
  const headNameByDept = new Map<string, string>();
  if (deptIdsNeedingHead.size > 0) {
    const deptIds = Array.from(deptIdsNeedingHead);
    const { data: depts } = await supabase
      .schema("hris")
      .from("departments")
      .select("id, head_employee_id, head_custom_name")
      .in("id", deptIds);

    const deptRows = (depts ?? []) as Array<{
      id: string;
      head_employee_id: string | null;
      head_custom_name: string | null;
    }>;

    const headIds = Array.from(
      new Set(
        deptRows
          .map((d) => d.head_employee_id)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const nameByEmpId = new Map<string, string>();
    if (headIds.length > 0) {
      const { data: heads } = await supabase
        .schema("hris")
        .from("employees")
        .select("id, first_name, middle_name, last_name, suffix")
        .in("id", headIds);
      for (const h of (heads ?? []) as Array<{
        id: string;
        first_name: string;
        middle_name: string | null;
        last_name: string;
        suffix: string | null;
      }>) {
        nameByEmpId.set(h.id, formatHeadName(h));
      }
    }

    for (const d of deptRows) {
      if (d.head_employee_id && nameByEmpId.has(d.head_employee_id)) {
        headNameByDept.set(d.id, nameByEmpId.get(d.head_employee_id)!);
      } else if (d.head_custom_name?.trim()) {
        headNameByDept.set(d.id, d.head_custom_name.trim().toUpperCase());
      }
    }
  }

  const result = new Map<string, DtrSignatory>();
  for (const e of employees) {
    const dept = effectiveDept(e);
    if (isCmo(dept)) {
      result.set(e.id, { name: CITY_MAYOR, title: "City Mayor" });
    } else if (e.is_department_head && isCadmo(dept)) {
      // The head of CADMO is the City Administrator, who cannot sign their own
      // DTR — the City Mayor signs instead.
      result.set(e.id, { name: CITY_MAYOR, title: "City Mayor" });
    } else if (e.is_department_head) {
      result.set(e.id, { name: CITY_ADMINISTRATOR, title: "City Administrator" });
    } else {
      result.set(e.id, {
        name: dept ? headNameByDept.get(dept.id) ?? "" : "",
        title: "Department Head / OIC",
      });
    }
  }
  return result;
}
