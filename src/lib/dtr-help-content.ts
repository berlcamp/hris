// The text of the DTR guide (components/dtr/dtr-guide-dialog.tsx): what each
// kind of user does, step by step, and the questions employees ask most.
// Kept apart from the component so a test can check every link still points at
// a real page.

export type DtrAudience = "officer" | "department" | "employee";

export const DTR_AUDIENCE_LABELS: Record<DtrAudience, string> = {
  officer: "HR / DTR officer",
  department: "Department admin",
  employee: "Employee",
};

export interface DtrStep {
  title: string;
  body: string;
  /** Page the step happens on. */
  href?: string;
  cta?: string;
}

export const DTR_STEPS: Record<DtrAudience, DtrStep[]> = {
  officer: [
    {
      title: "Import each device's file",
      body: "On the DTR page, choose Import from Dahua, pick the device the file came from, and import. Import every building's file — the order does not matter, and uploading the same file twice adds nothing. Each day is rebuilt from all of the employee's punches, from every device.",
      href: "/dtr",
      cta: "Open DTR",
    },
    {
      title: "Set schedules for anyone not on regular hours",
      body: "In Work Schedules, build rotations (day/night weeks, rostered Saturdays), assign them from a date, and use the Calendar for one-off changes or rest days. Punches already saved are re-sorted automatically; hand-corrected days are never touched.",
      href: "/admin/schedules",
      cta: "Open Work Schedules",
    },
    {
      title: "Review Unsettled Days before printing",
      body: "Unsettled Days lists every day with blank cells, beside the punches each device recorded. Check what happened, then Fix the day — with the real times, or a reason such as OB, leave or NO BREAK.",
      href: "/attendance-corrections/unsettled",
      cta: "Open Unsettled Days",
    },
    {
      title: "Approve department requests",
      body: "Departments file proof-backed correction requests. Review the proof and the minutes it changes, then approve or reject. Approved days are locked against later imports.",
      href: "/attendance-corrections",
      cta: "Open Corrections",
    },
    {
      title: "Generate and print the DTR",
      body: "Download the month's DTRs. If any days still have blank punches, a warning lists them — blanks print blank and cost nothing until settled, except a fully blank morning or afternoon, which is a 4:00 half day.",
      href: "/dtr",
      cta: "Open DTR",
    },
  ],
  department: [
    {
      title: "Check Unsettled Days every month",
      body: "Unsettled Days shows your department's days with blank cells and the punches behind them, so you can see who forgot a scan and when.",
      href: "/attendance-corrections/unsettled",
      cta: "Open Unsettled Days",
    },
    {
      title: "Request a fix with proof",
      body: "Choose Request fix on the day, enter the real times or a reason (OB, travel, leave, NO BREAK), and attach the proof — a travel order, logbook or memo. HR reviews it before it reaches the DTR.",
      href: "/attendance-corrections/new",
      cta: "New request",
    },
    {
      title: "Keep your staff's schedules right",
      body: "In Work Schedules, assign a rotation to staff who work shifts or rostered weekends, and use the Calendar for one-off swaps or rest days. A wrong schedule puts punches in the wrong cells.",
      href: "/admin/schedules",
      cta: "Open Work Schedules",
    },
    {
      title: "Download your department's DTRs",
      body: "Generate the month's DTRs once the unsettled days are settled. The warning after download lists any that are still blank.",
      href: "/dtr",
      cta: "Open DTR",
    },
  ],
  employee: [
    {
      title: "Scan once for each event",
      body: "Arrival, out for lunch, back from lunch, and departure. Any building's device works — the system puts your punches together. Scanning twice is fine; the earliest arrival and the latest departure are kept.",
    },
    {
      title: "Check your DTR",
      body: "Download your DTR for the month. A blank cell means a punch is missing and needs settling.",
      href: "/dtr",
      cta: "Open DTR",
    },
    {
      title: "Settle any blank cell",
      body: "Give your department admin the reason and proof (OB, travel order, leave, or that you worked through lunch). They file the correction and HR approves it. A single blank costs nothing until settled; a whole blank morning or afternoon is a 4:00 half day until settled.",
    },
  ],
};

export interface DtrFaq {
  q: string;
  a: string;
}

export const DTR_FAQ: DtrFaq[] = [
  {
    q: "I logged in at Building 1 and out at Building 3. Will my DTR be complete?",
    a: "Yes. Once both buildings' files are imported, the day is built from all your punches, from every device, in whatever order the files were imported.",
  },
  {
    q: "I scanned several times when I arrived. Which time counts?",
    a: "The earliest. Scans within an hour of arriving, before mid-morning, are repeats of the arrival — they never become your time-out.",
  },
  {
    q: "I forgot my lunch scans. Am I charged?",
    a: "No. AM Out and PM In stay blank and cost nothing until settled. Settle them with your real times, or NO BREAK if you worked through lunch.",
  },
  {
    q: "My whole afternoon is blank. Why does it show 4:00?",
    a: "A morning or afternoon with no punches at all is a half day. Settle it with leave, OB, travel or the real times and the 4:00 is removed.",
  },
  {
    q: "I scanned right after coming back from lunch and forgot to clock out. What shows?",
    a: "The second scan is a repeat of your lunch return, not your time-out. PM Out stays blank to settle.",
  },
  {
    q: "I work night shifts or rotate between days and nights. How are my punches read?",
    a: "Ask your officer to put you on a rotation in Work Schedules. A morning scan after a night shift is filed under the night it began; on a day-shift day it stays on its own date.",
  },
  {
    q: "Why does my DTR say REST DAY on a weekday?",
    a: "Your rotation or a one-off change makes that day a rest day. No hours are owed; any punches still print.",
  },
  {
    q: "I worked on a Saturday. Is it counted?",
    a: "If your schedule rosters Saturday, it is a workday like any other. If not, it is a rest day: your punches print and nothing is charged.",
  },
  {
    q: "My times moved after my schedule was changed. Is that right?",
    a: "Yes. When a schedule changes, saved punches are re-sorted against it automatically. Days someone corrected by hand are never changed.",
  },
];
