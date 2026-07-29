import type { JobOrderPayrollMember } from "@/lib/types";

export const PAYROLL_SELECT = `
  id, period_start, period_end, days, description, particulars, areas,
  payroll_date, status, finalized_at, finalized_by, is_reconstructed,
  legacy_id, created_at, updated_at
`;

export const MEMBER_SELECT = `
  id, payroll_id, job_order_employee_id, days, hours, full_name, area_name,
  sub_area, daily_rate, sss_no, sss_ss, sss_ec, has_atm,
  landbank_account_number, community_tax_number, community_tax_date,
  community_tax_place_issued, legacy_id, created_at, updated_at
`;

export const JO_SELECT_FOR_SNAPSHOT = `
  id, full_name, sort_name, sex, purok, barangay, area_id, sub_area,
  daily_rate, previous_daily_rate, working_hours, date_started, eligibility,
  recommended_by, remarks, remarks_2, has_atm, landbank_account_number,
  sss_no, sss_ss, sss_ec, community_tax_number, community_tax_date,
  community_tax_place_issued, status, legacy_id, created_at, updated_at,
  job_order_areas(name)
`;

// PostgREST serializes numeric(...) as a STRING to avoid float precision loss.
// Without this, `rate * days` becomes string concatenation and every total is
// garbage. Same defect class as job-order-actions.ts:39.
export function toNumber(v: unknown): number | null {
  return v == null ? null : Number(v);
}

export function shapeMember(r: Record<string, unknown>): JobOrderPayrollMember {
  return {
    ...(r as unknown as JobOrderPayrollMember),
    days: toNumber(r.days),
    hours: toNumber(r.hours),
    daily_rate: toNumber(r.daily_rate),
    sss_ss: toNumber(r.sss_ss),
    sss_ec: toNumber(r.sss_ec),
  };
}
