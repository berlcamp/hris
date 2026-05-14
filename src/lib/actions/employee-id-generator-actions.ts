"use server";

import { getCurrentUser } from "@/lib/actions/auth-actions";
import { isDeptHead } from "@/lib/auth-helpers";
import { getEmployees } from "@/lib/actions/employee-actions";
import { findEmployeeBySearchedName, type EmployeeNameRow } from "@/lib/employee-name-match";

export type EmployeeIdMatchRow = {
  searchedName: string;
  matchedName: string | null;
  employeeId: string | null;
};

export async function matchSearchedNamesToEmployees(
  searchedNames: string[]
): Promise<EmployeeIdMatchRow[]> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  if (
    !["super_admin", "hr_admin"].includes(user.role) &&
    !isDeptHead(user.role)
  ) {
    throw new Error("Forbidden");
  }

  const employees = await getEmployees();
  const rows: EmployeeNameRow[] = employees.map((e) => ({
    id: e.id,
    first_name: e.first_name,
    middle_name: e.middle_name,
    last_name: e.last_name,
    suffix: e.suffix,
    status: e.status,
  }));

  return searchedNames.map((searchedName) => {
    const match = findEmployeeBySearchedName(searchedName, rows);
    return {
      searchedName,
      matchedName: match?.matchedName ?? null,
      employeeId: match?.id ?? null,
    };
  });
}
