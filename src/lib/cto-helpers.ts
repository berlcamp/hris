// Compensatory Overtime Credit (COC) / Compensatory Time Off (CTO) rules
// per CSC-DBM Joint Circular No. 2, s. 2004. Pure functions shared by the
// server actions (authoritative enforcement) and client components (live
// previews). All dates are YYYY-MM-DD strings, compared lexicographically.

export const CTO_MONTHLY_EARN_CAP = 40;
export const CTO_MAX_BALANCE = 120;
export const CTO_EXPIRING_SOON_DAYS = 30;

export const CTO_MULTIPLIERS = {
  regular: 1.0,
  rest_day: 1.5,
  holiday: 1.5,
} as const;

export type CtoDayType = keyof typeof CTO_MULTIPLIERS;

export const CTO_DAY_TYPE_LABELS: Record<CtoDayType, string> = {
  regular: "Regular workday (×1.0)",
  rest_day: "Rest day (×1.5)",
  holiday: "Holiday (×1.5)",
};

export interface CtoEarnLite {
  id: string;
  ot_date: string;
  expiry_date: string;
  hours_earned: number;
  created_at: string;
}

export interface CtoUsageLite {
  id: string;
  start_date: string;
  hours_applied: number;
  created_at: string;
}

export interface CtoBalanceResult {
  /** Unexpired, unconsumed COC hours as of `asOf`. */
  available: number;
  /** COC hours that expired unused (forfeited) as of `asOf`. */
  expiredForfeited: number;
  /** Unconsumed hours expiring within CTO_EXPIRING_SOON_DAYS of `asOf`. */
  expiringSoon: number;
  perEarn: {
    id: string;
    ot_date: string;
    expiry_date: string;
    hours_earned: number;
    remaining: number;
  }[];
  /** Approved usages that could not be fully covered (data drift, e.g. after a void). */
  shortfalls: { usageId: string; hours: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Today's date as YYYY-MM-DD in Asia/Manila, regardless of runtime timezone. */
export function manilaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** YYYY-MM-DD + n days, computed in UTC to avoid DST/timezone drift. */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** One year after the OT date — mirrors the DB generated column exactly. */
export function ctoExpiryDate(otDate: string): string {
  const [y, m, d] = otDate.split("-").map(Number);
  // Postgres date + interval '1 year' clamps Feb 29 → Feb 28 on non-leap years.
  const target = new Date(Date.UTC(y + 1, m - 1, d));
  if (target.getUTCMonth() !== m - 1) {
    return new Date(Date.UTC(y + 1, m - 1, d - 1)).toISOString().slice(0, 10);
  }
  return target.toISOString().slice(0, 10);
}

/** "YYYY-MM" calendar-month key, used for the 40h/month earning cap. */
export function ctoMonthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * FIFO balance computation. Approved usages consume earn entries oldest-first;
 * an earn is eligible for a usage when it was earned on or before the usage's
 * start date and has not yet expired on that date. Expired remainders are
 * forfeited — they simply stop counting, no ledger mutation needed.
 */
export function computeCtoBalance(
  earns: CtoEarnLite[],
  approvedUsages: CtoUsageLite[],
  asOf: string
): CtoBalanceResult {
  const byFifo = [...earns].sort(
    (a, b) =>
      a.ot_date.localeCompare(b.ot_date) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );
  const usages = [...approvedUsages].sort(
    (a, b) =>
      a.start_date.localeCompare(b.start_date) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );

  const remaining = new Map<string, number>(
    byFifo.map((e) => [e.id, Number(e.hours_earned)])
  );
  const shortfalls: CtoBalanceResult["shortfalls"] = [];

  for (const usage of usages) {
    let need = Number(usage.hours_applied);
    for (const earn of byFifo) {
      if (need <= 0) break;
      const left = remaining.get(earn.id) ?? 0;
      if (left <= 0) continue;
      if (earn.ot_date > usage.start_date) continue;
      if (earn.expiry_date < usage.start_date) continue;
      const take = Math.min(left, need);
      remaining.set(earn.id, round2(left - take));
      need = round2(need - take);
    }
    if (need > 0) shortfalls.push({ usageId: usage.id, hours: need });
  }

  const soonCutoff = addDaysToDateString(asOf, CTO_EXPIRING_SOON_DAYS);
  let available = 0;
  let expiredForfeited = 0;
  let expiringSoon = 0;

  const perEarn = byFifo.map((earn) => {
    const left = remaining.get(earn.id) ?? 0;
    if (left > 0) {
      if (earn.expiry_date < asOf) {
        expiredForfeited = round2(expiredForfeited + left);
      } else if (earn.ot_date <= asOf) {
        available = round2(available + left);
        if (earn.expiry_date < soonCutoff) {
          expiringSoon = round2(expiringSoon + left);
        }
      }
    }
    return {
      id: earn.id,
      ot_date: earn.ot_date,
      expiry_date: earn.expiry_date,
      hours_earned: Number(earn.hours_earned),
      remaining: left,
    };
  });

  return { available, expiredForfeited, expiringSoon, perEarn, shortfalls };
}

export interface CtoEarnClampResult {
  /** hours_worked × multiplier before caps. */
  rawEarned: number;
  /** The value to store — min(raw, monthly headroom, balance headroom). */
  storedEarned: number;
  clampedBy: ("monthly_cap" | "balance_cap")[];
}

/**
 * Caps applied when HR encodes a COC earn entry: max 40h earned per calendar
 * month and max 120h accumulated unexpired balance. Excess is forfeited at
 * entry time (never stored), per CSC-DBM JC No. 2, s. 2004.
 */
export function computeEarnClamp(input: {
  hoursWorked: number;
  dayType: CtoDayType;
  monthEarnedSoFar: number;
  availableNow: number;
}): CtoEarnClampResult {
  const rawEarned = round2(input.hoursWorked * CTO_MULTIPLIERS[input.dayType]);
  const byMonth = Math.max(0, round2(CTO_MONTHLY_EARN_CAP - input.monthEarnedSoFar));
  const byBalance = Math.max(0, round2(CTO_MAX_BALANCE - input.availableNow));

  const storedEarned = round2(Math.min(rawEarned, byMonth, byBalance));
  const clampedBy: CtoEarnClampResult["clampedBy"] = [];
  if (storedEarned < rawEarned) {
    if (byMonth < rawEarned) clampedBy.push("monthly_cap");
    if (byBalance < rawEarned) clampedBy.push("balance_cap");
  }
  return { rawEarned, storedEarned, clampedBy };
}

/** Suggested day type for an OT date: holiday > weekend rest day > regular. */
export function suggestDayType(otDate: string, isHoliday: boolean): CtoDayType {
  if (isHoliday) return "holiday";
  const [y, m, d] = otDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6 ? "rest_day" : "regular";
}

/**
 * Working days between start and end inclusive, skipping Saturdays, Sundays
 * and the supplied (full) holiday dates. Used to expand a CTO availment into
 * its specific dates.
 */
export function expandWorkingDays(
  start: string,
  end: string,
  holidayDates: Set<string>
): string[] {
  if (!start || !end || end < start) return [];
  const days: string[] = [];
  let cursor = start;
  // Bounded walk — an availment is at most a few weeks; hard-stop at 62 days.
  for (let i = 0; i < 62 && cursor <= end; i++) {
    const [y, m, d] = cursor.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6 && !holidayDates.has(cursor)) days.push(cursor);
    cursor = addDaysToDateString(cursor, 1);
  }
  return days;
}
