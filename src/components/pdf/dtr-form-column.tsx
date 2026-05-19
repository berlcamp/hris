import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type {
  DtrEntry,
  DtrScheduleInfo,
  DtrSummary,
} from "@/lib/actions/attendance-actions";

// --- Column widths (with-break layout, must sum to 100) ---
const W_DAY = 10;
const W_AM_ARR = 16;
const W_AM_DEP = 16;
const W_PM_ARR = 16;
const W_PM_DEP = 16;
const W_UT_HR = 13;
const W_UT_MIN = 13;
const W_AM_GROUP = W_AM_ARR + W_AM_DEP; // 32
const W_PM_GROUP = W_PM_ARR + W_PM_DEP; // 32
const W_UT_GROUP = W_UT_HR + W_UT_MIN; // 26

// --- Column widths (no-break layout — 2 time columns instead of 4) ---
const NB_IN = 32;
const NB_OUT = 32;
const NB_TIME_GROUP = NB_IN + NB_OUT; // 64

const w = (n: number) => `${n}%` as const;

const styles = StyleSheet.create({
  column: {
    paddingHorizontal: 4,
  },
  formNo: {
    fontSize: 6.5,
    fontStyle: "italic",
    marginBottom: 1,
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    letterSpacing: 1,
  },
  ooo: {
    fontSize: 7,
    textAlign: "center",
    marginBottom: 3,
  },
  nameLine: {
    borderBottom: "0.5pt solid #000",
    paddingBottom: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textAlign: "center",
  },
  nameCaption: {
    fontSize: 6,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    fontSize: 7,
    marginBottom: 2,
  },
  metaItalic: {
    fontStyle: "italic",
    fontSize: 6.5,
  },
  metaValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    borderBottom: "0.5pt solid #000",
    flex: 1,
    paddingHorizontal: 2,
  },
  // Table
  table: {
    border: "0.5pt solid #000",
    marginTop: 4,
  },
  headerOuter: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #000",
  },
  headerDayCell: {
    width: w(W_DAY),
    borderRight: "0.5pt solid #000",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 3,
  },
  headerDayText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
  },
  headerGroupCol: {
    flex: 1,
  },
  headerGroupTop: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #000",
  },
  headerGroupCell: {
    paddingVertical: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textAlign: "center",
    borderRight: "0.5pt solid #000",
  },
  headerGroupCellLast: {
    paddingVertical: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textAlign: "center",
  },
  headerSubRow: {
    flexDirection: "row",
  },
  headerSubCell: {
    paddingVertical: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    textAlign: "center",
    borderRight: "0.5pt solid #000",
  },
  headerSubCellLast: {
    paddingVertical: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    textAlign: "center",
  },
  // Data rows
  row: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #999",
    minHeight: 11,
  },
  rowWeekend: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #999",
    minHeight: 11,
    backgroundColor: "#f1f1f1",
  },
  dayCell: {
    width: w(W_DAY),
    borderRight: "0.5pt solid #000",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textAlign: "center",
    paddingVertical: 1.5,
  },
  timeCell: {
    fontSize: 7,
    fontFamily: "Courier",
    textAlign: "center",
    borderRight: "0.5pt solid #999",
    paddingVertical: 1.5,
  },
  utCell: {
    fontSize: 7,
    textAlign: "center",
    borderRight: "0.5pt solid #999",
    paddingVertical: 1.5,
  },
  utCellLast: {
    fontSize: 7,
    textAlign: "center",
    paddingVertical: 1.5,
  },
  // Spanning row (weekend/leave/absent)
  spanCell: {
    width: w(100 - W_DAY),
    paddingVertical: 1.5,
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1,
  },
  // Total row
  totalRow: {
    flexDirection: "row",
    borderTop: "0.5pt solid #000",
    backgroundColor: "#eee",
  },
  totalLabelCell: {
    width: w(W_DAY + W_AM_GROUP + W_PM_GROUP),
    textAlign: "right",
    paddingRight: 4,
    paddingVertical: 2,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    borderRight: "0.5pt solid #000",
  },
  // Summary block
  summary: {
    marginTop: 5,
    fontSize: 7,
  },
  summaryLine: {
    flexDirection: "row",
    marginBottom: 1.5,
  },
  summaryLabel: {
    fontSize: 7,
  },
  summaryLabelBold: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
  },
  // Signatures
  certText: {
    fontSize: 7,
    fontStyle: "italic",
    marginTop: 6,
    textAlign: "justify",
  },
  sigBlock: {
    marginTop: 22,
    alignItems: "center",
  },
  sigLine: {
    width: "70%",
    borderTop: "0.5pt solid #000",
    marginTop: 1,
    paddingTop: 1,
  },
  sigCaption: {
    fontSize: 7,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 2,
  },
  mayorBlock: {
    marginTop: 22,
    alignItems: "center",
  },
  mayorName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    textAlign: "center",
  },
  mayorLine: {
    width: "70%",
    borderTop: "0.5pt solid #000",
    marginTop: 1,
    paddingTop: 1,
  },
  mayorTitle: {
    fontSize: 7,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 2,
  },
  systemNote: {
    fontSize: 6.5,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 14,
    color: "#666",
  },
});

interface DtrFormColumnProps {
  entries: DtrEntry[];
  summary: DtrSummary;
  employeeName: string;
  periodLabel: string;
  schedule: DtrScheduleInfo;
}

function dayLabelFor(entry: DtrEntry): string {
  // Render the day-of-month number (e.g., "1", "2"); matches CSC Form 48 layout.
  return String(Number(entry.date.split("-")[2]));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(t: string | null): string {
  if (!t) return "";
  return t; // already HH:MM
}

// 0.125 leave-credit days per hour (8 hours = 1.0 day). Minute granularity is
// prorated linearly: 1 min = 0.125 / 60 days.
function convertMinsToLeaveCredits(totalMins: number): string {
  const days = totalMins / 480;
  return days.toFixed(3);
}

export function DtrFormColumn({
  entries,
  summary,
  employeeName,
  periodLabel,
  schedule,
}: DtrFormColumnProps) {
  const hasBreak = schedule.has_break;
  const totalUtMins =
    summary.total_late_minutes + summary.total_undertime_minutes;
  const totalUtHours = Math.floor(totalUtMins / 60);
  const totalUtRemMins = totalUtMins % 60;
  const credits = convertMinsToLeaveCredits(totalUtMins);

  const renderRow = (entry: DtrEntry) => {
    const isWeekend =
      entry.day_of_week === "Saturday" || entry.day_of_week === "Sunday";
    const dayLabel = dayLabelFor(entry);

    // Spanning row for weekend / approved leave / absent (no time entries)
    let spanLabel: string | null = null;
    if (isWeekend) {
      spanLabel = entry.day_of_week.toUpperCase();
    } else if (entry.leave_type && !entry.is_absent) {
      spanLabel = entry.leave_type.toUpperCase();
    } else if (
      entry.is_absent &&
      !entry.time_in_am &&
      !entry.time_out_am &&
      !entry.time_in_pm &&
      !entry.time_out_pm
    ) {
      spanLabel = "ABSENT";
    }

    const totalUtForDay = entry.late_minutes + entry.undertime_minutes;
    const utH = Math.floor(totalUtForDay / 60);
    const utM = totalUtForDay % 60;

    return (
      <View
        key={entry.date}
        style={isWeekend ? styles.rowWeekend : styles.row}
        wrap={false}
      >
        <Text style={styles.dayCell}>{dayLabel}</Text>
        {spanLabel ? (
          <Text style={styles.spanCell}>{spanLabel}</Text>
        ) : hasBreak ? (
          <>
            <Text style={[styles.timeCell, { width: w(W_AM_ARR) }]}>
              {formatTime(entry.time_in_am)}
            </Text>
            <Text style={[styles.timeCell, { width: w(W_AM_DEP) }]}>
              {formatTime(entry.time_out_am)}
            </Text>
            <Text style={[styles.timeCell, { width: w(W_PM_ARR) }]}>
              {formatTime(entry.time_in_pm)}
            </Text>
            <Text style={[styles.timeCell, { width: w(W_PM_DEP) }]}>
              {formatTime(entry.time_out_pm)}
            </Text>
            <Text style={[styles.utCell, { width: w(W_UT_HR) }]}>
              {totalUtForDay > 0 ? String(utH) : ""}
            </Text>
            <Text style={[styles.utCellLast, { width: w(W_UT_MIN) }]}>
              {totalUtForDay > 0 ? pad2(utM) : ""}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.timeCell, { width: w(NB_IN) }]}>
              {formatTime(entry.time_in_am)}
            </Text>
            <Text style={[styles.timeCell, { width: w(NB_OUT) }]}>
              {formatTime(entry.time_out_pm)}
            </Text>
            <Text style={[styles.utCell, { width: w(W_UT_HR) }]}>
              {totalUtForDay > 0 ? String(utH) : ""}
            </Text>
            <Text style={[styles.utCellLast, { width: w(W_UT_MIN) }]}>
              {totalUtForDay > 0 ? pad2(utM) : ""}
            </Text>
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.column}>
      {/* Header */}
      <Text style={styles.formNo}>Civil Service Form No. 48</Text>
      <Text style={styles.title}>DAILY TIME RECORD</Text>
      <Text style={styles.ooo}>--- o0o ---</Text>

      {/* Name */}
      <Text style={styles.nameLine}>{employeeName.toUpperCase()}</Text>
      <Text style={styles.nameCaption}>(Name)</Text>

      {/* Period meta */}
      <View style={styles.metaRow}>
        <Text style={styles.metaItalic}>For the month of </Text>
        <Text style={styles.metaValue}>{periodLabel}</Text>
      </View>
      <View style={styles.metaRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaItalic}>Official hours for arrival</Text>
          <Text style={styles.metaItalic}>and departure</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaItalic}>
            {hasBreak
              ? `Regular days: ${schedule.time_in}–${schedule.break_start} / ${schedule.break_end}–${schedule.time_out}`
              : `Shift: ${schedule.time_in}–${schedule.time_out} (no break)`}
          </Text>
          <Text style={styles.metaItalic}>Saturdays: —</Text>
        </View>
      </View>

      {/* Table */}
      <View style={styles.table}>
        {/* Header */}
        <View style={styles.headerOuter}>
          <View style={styles.headerDayCell}>
            <Text style={styles.headerDayText}>Day</Text>
          </View>
          <View style={styles.headerGroupCol}>
            {hasBreak ? (
              <>
                <View style={styles.headerGroupTop}>
                  <Text style={[styles.headerGroupCell, { width: w((W_AM_GROUP * 100) / (100 - W_DAY)) }]}>
                    A.M.
                  </Text>
                  <Text style={[styles.headerGroupCell, { width: w((W_PM_GROUP * 100) / (100 - W_DAY)) }]}>
                    P.M.
                  </Text>
                  <Text style={[styles.headerGroupCellLast, { width: w((W_UT_GROUP * 100) / (100 - W_DAY)) }]}>
                    Undertime
                  </Text>
                </View>
                <View style={styles.headerSubRow}>
                  <Text style={[styles.headerSubCell, { width: w((W_AM_ARR * 100) / (100 - W_DAY)) }]}>
                    Arrival
                  </Text>
                  <Text style={[styles.headerSubCell, { width: w((W_AM_DEP * 100) / (100 - W_DAY)) }]}>
                    Departure
                  </Text>
                  <Text style={[styles.headerSubCell, { width: w((W_PM_ARR * 100) / (100 - W_DAY)) }]}>
                    Arrival
                  </Text>
                  <Text style={[styles.headerSubCell, { width: w((W_PM_DEP * 100) / (100 - W_DAY)) }]}>
                    Departure
                  </Text>
                  <Text style={[styles.headerSubCell, { width: w((W_UT_HR * 100) / (100 - W_DAY)) }]}>
                    Hours
                  </Text>
                  <Text style={[styles.headerSubCellLast, { width: w((W_UT_MIN * 100) / (100 - W_DAY)) }]}>
                    Minutes
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.headerGroupTop}>
                  <Text style={[styles.headerGroupCell, { width: w((NB_TIME_GROUP * 100) / (100 - W_DAY)) }]}>
                    Shift
                  </Text>
                  <Text style={[styles.headerGroupCellLast, { width: w((W_UT_GROUP * 100) / (100 - W_DAY)) }]}>
                    Undertime
                  </Text>
                </View>
                <View style={styles.headerSubRow}>
                  <Text style={[styles.headerSubCell, { width: w((NB_IN * 100) / (100 - W_DAY)) }]}>
                    Arrival
                  </Text>
                  <Text style={[styles.headerSubCell, { width: w((NB_OUT * 100) / (100 - W_DAY)) }]}>
                    Departure
                  </Text>
                  <Text style={[styles.headerSubCell, { width: w((W_UT_HR * 100) / (100 - W_DAY)) }]}>
                    Hours
                  </Text>
                  <Text style={[styles.headerSubCellLast, { width: w((W_UT_MIN * 100) / (100 - W_DAY)) }]}>
                    Minutes
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Data rows */}
        {entries.map(renderRow)}

        {/* Total row */}
        <View style={styles.totalRow} wrap={false}>
          <Text style={styles.totalLabelCell}>Total</Text>
          <Text
            style={{
              width: w(W_UT_HR),
              textAlign: "center",
              fontSize: 7,
              fontFamily: "Helvetica-Bold",
              paddingVertical: 2,
              borderRight: "0.5pt solid #000",
            }}
          >
            {totalUtHours > 0 ? String(totalUtHours) : ""}
          </Text>
          <Text
            style={{
              width: w(W_UT_MIN),
              textAlign: "center",
              fontSize: 7,
              fontFamily: "Helvetica-Bold",
              paddingVertical: 2,
            }}
          >
            {totalUtMins > 0 ? pad2(totalUtRemMins) : ""}
          </Text>
        </View>
      </View>

      {/* Summary: Tardy + Conversion */}
      <View style={styles.summary} wrap={false}>
        <View style={styles.summaryLine}>
          <Text style={styles.summaryLabel}>Total Tardy: </Text>
          <Text style={styles.summaryLabelBold}>
            {summary.total_late_minutes} minute(s)
          </Text>
        </View>
        <View style={styles.summaryLine}>
          <Text style={styles.summaryLabel}>Total Undertime: </Text>
          <Text style={styles.summaryLabelBold}>
            {summary.total_undertime_minutes} minute(s)
          </Text>
        </View>
        <View style={styles.summaryLine}>
          <Text style={styles.summaryLabel}>Conversion to Leave Credits: </Text>
          <Text style={styles.summaryLabelBold}>{credits} day(s)</Text>
        </View>
      </View>

      {/* Certification */}
      <Text style={styles.certText} wrap={false}>
        I certify on my honor that the above is a true and correct report of the
        hours of work performed, record of which was made daily at the time of
        arrival at and departure from office.
      </Text>

      {/* Employee signature: line first, caption below */}
      <View style={styles.sigBlock} wrap={false}>
        <View style={styles.sigLine} />
        <Text style={styles.sigCaption}>
          VERIFIED as to the prescribed office hours.
        </Text>
      </View>

      {/* City Mayor — printed name above the line, title below */}
      <View style={styles.mayorBlock} wrap={false}>
        <Text style={styles.mayorName}>SAM NORMAN G. FUENTES</Text>
        <View style={styles.mayorLine} />
        <Text style={styles.mayorTitle}>City Mayor</Text>
      </View>

      <Text style={styles.systemNote}>This DTR is system generated.</Text>
    </View>
  );
}
