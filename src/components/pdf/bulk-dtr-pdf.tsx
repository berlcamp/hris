import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type {
  BulkDtrResult,
} from "@/lib/actions/attendance-actions";
import { getEffectivePosition } from "@/lib/employee-position";

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 8,
    fontFamily: "Helvetica",
  },
  formNo: {
    fontSize: 7,
    textAlign: "right",
    marginBottom: 2,
    fontStyle: "italic",
  },
  header: {
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 9,
    marginBottom: 2,
  },
  title: {
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
    letterSpacing: 1,
  },
  periodText: {
    fontSize: 9,
    marginBottom: 6,
  },
  infoSection: {
    flexDirection: "row",
    marginBottom: 8,
    borderBottom: "0.5pt solid #000",
    paddingBottom: 4,
  },
  infoCol: { flex: 1 },
  infoRow: { flexDirection: "row", marginBottom: 2 },
  infoLabel: { width: 70, fontSize: 8 },
  infoValue: {
    flex: 1,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    borderBottom: "0.5pt solid #999",
  },
  table: { marginTop: 3 },
  tableHeaderTop: {
    flexDirection: "row",
    borderTop: "1pt solid #000",
    backgroundColor: "#f5f5f5",
    paddingVertical: 2,
  },
  tableHeaderBottom: {
    flexDirection: "row",
    borderBottom: "1pt solid #000",
    backgroundColor: "#f5f5f5",
    paddingVertical: 2,
  },
  amPmHeader: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    borderBottom: "0.5pt solid #ccc",
    paddingBottom: 1,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #ddd",
    minHeight: 14,
    alignItems: "center",
  },
  tableRowWeekend: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #ddd",
    minHeight: 14,
    alignItems: "center",
    backgroundColor: "#f9f9f9",
  },
  colDate: { width: "10%", paddingHorizontal: 2, textAlign: "center" },
  colDayName: { width: "7%", paddingHorizontal: 1, textAlign: "center" },
  colTime: { width: "10%", paddingHorizontal: 2, textAlign: "center" },
  colLate: { width: "8%", paddingHorizontal: 2, textAlign: "center" },
  colUT: { width: "8%", paddingHorizontal: 2, textAlign: "center" },
  colRemarks: { width: "17%", paddingHorizontal: 2 },
  headerText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textAlign: "center",
  },
  cellText: { fontSize: 7 },
  cellTextBold: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  cellTextMono: { fontSize: 7, fontFamily: "Courier" },
  summarySection: {
    marginTop: 10,
    borderTop: "1pt solid #000",
    paddingTop: 6,
  },
  summaryRow: { flexDirection: "row", marginBottom: 3 },
  summaryLabel: { width: "40%", fontSize: 8 },
  summaryValue: {
    width: "15%",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  certification: {
    marginTop: 15,
    fontSize: 8,
    textAlign: "center",
    fontStyle: "italic",
  },
  signatureSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 30,
  },
  signatureBlock: { width: "40%", textAlign: "center" },
  signatureLine: {
    borderTop: "1pt solid #000",
    marginTop: 25,
    paddingTop: 3,
    fontSize: 7,
  },
  cscNote: {
    fontSize: 6,
    color: "#666",
    marginTop: 10,
    textAlign: "center",
    fontStyle: "italic",
  },
});

interface BulkDtrPdfProps {
  results: BulkDtrResult[];
  departmentName: string;
  periodLabel: string;
}

function formatDayLabel(dateStr: string): string {
  // dateStr is YYYY-MM-DD; render as M/D to keep cells compact
  const [, mm, dd] = dateStr.split("-");
  return `${Number(mm)}/${Number(dd)}`;
}

export function BulkDtrPdf({ results, departmentName, periodLabel }: BulkDtrPdfProps) {
  return (
    <Document>
      {results.map(({ employee, entries, summary }) => {
        const fullName = [employee.first_name, employee.middle_name, employee.last_name]
          .filter(Boolean)
          .join(" ");

        return (
          <Page
            key={employee.id}
            size="LEGAL"
            orientation="portrait"
            style={styles.page}
          >
            <Text style={styles.formNo}>Civil Service Form No. 48</Text>

            <View style={styles.header}>
              <Text style={styles.subtitle}>Republic of the Philippines</Text>
              <Text style={styles.subtitle}>Local Government Unit</Text>
              <Text style={styles.title}>DAILY TIME RECORD</Text>
            </View>

            <Text style={styles.periodText}>For the period: {periodLabel}</Text>

            <View style={styles.infoSection}>
              <View style={styles.infoCol}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Name:</Text>
                  <Text style={styles.infoValue}>{fullName}</Text>
                </View>
              </View>
              <View style={styles.infoCol}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Office:</Text>
                  <Text style={styles.infoValue}>
                    {employee.departments?.name ?? departmentName}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Position:</Text>
                  <Text style={styles.infoValue}>
                    {getEffectivePosition(employee) ?? ""}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={{ fontSize: 7, marginBottom: 4 }}>
              Regular Working Hours: 8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM
            </Text>

            <View style={styles.table}>
              <View style={styles.tableHeaderTop}>
                <View style={styles.colDate}>
                  <Text style={styles.headerText}>Date</Text>
                </View>
                <View style={styles.colDayName}>
                  <Text style={styles.headerText}> </Text>
                </View>
                <View style={{ width: "20%", textAlign: "center" }}>
                  <Text style={styles.amPmHeader}>A.M.</Text>
                </View>
                <View style={{ width: "20%", textAlign: "center" }}>
                  <Text style={styles.amPmHeader}>P.M.</Text>
                </View>
                <View style={styles.colLate}>
                  <Text style={styles.headerText}> </Text>
                </View>
                <View style={styles.colUT}>
                  <Text style={styles.headerText}> </Text>
                </View>
                <View style={styles.colRemarks}>
                  <Text style={styles.headerText}> </Text>
                </View>
              </View>

              <View style={styles.tableHeaderBottom}>
                <View style={styles.colDate}>
                  <Text style={styles.headerText}> </Text>
                </View>
                <View style={styles.colDayName}>
                  <Text style={styles.headerText}> </Text>
                </View>
                <View style={styles.colTime}>
                  <Text style={styles.headerText}>Arrival</Text>
                </View>
                <View style={styles.colTime}>
                  <Text style={styles.headerText}>Departure</Text>
                </View>
                <View style={styles.colTime}>
                  <Text style={styles.headerText}>Arrival</Text>
                </View>
                <View style={styles.colTime}>
                  <Text style={styles.headerText}>Departure</Text>
                </View>
                <View style={styles.colLate}>
                  <Text style={styles.headerText}>Late{"\n"}(mins)</Text>
                </View>
                <View style={styles.colUT}>
                  <Text style={styles.headerText}>Under-{"\n"}time</Text>
                </View>
                <View style={styles.colRemarks}>
                  <Text style={styles.headerText}>Remarks</Text>
                </View>
              </View>

              {entries.map((entry) => {
                const isWeekend =
                  entry.day_of_week === "Saturday" || entry.day_of_week === "Sunday";
                return (
                  <View
                    key={entry.date}
                    style={isWeekend ? styles.tableRowWeekend : styles.tableRow}
                    wrap={false}
                  >
                    <View style={styles.colDate}>
                      <Text style={styles.cellTextBold}>
                        {formatDayLabel(entry.date)}
                      </Text>
                    </View>
                    <View style={styles.colDayName}>
                      <Text style={styles.cellText}>
                        {entry.day_of_week.slice(0, 3)}
                      </Text>
                    </View>
                    <View style={styles.colTime}>
                      <Text style={styles.cellTextMono}>
                        {entry.time_in_am ?? ""}
                      </Text>
                    </View>
                    <View style={styles.colTime}>
                      <Text style={styles.cellTextMono}>
                        {entry.time_out_am ?? ""}
                      </Text>
                    </View>
                    <View style={styles.colTime}>
                      <Text style={styles.cellTextMono}>
                        {entry.time_in_pm ?? ""}
                      </Text>
                    </View>
                    <View style={styles.colTime}>
                      <Text style={styles.cellTextMono}>
                        {entry.time_out_pm ?? ""}
                      </Text>
                    </View>
                    <View style={styles.colLate}>
                      <Text style={styles.cellText}>
                        {entry.late_minutes > 0 ? String(entry.late_minutes) : ""}
                      </Text>
                    </View>
                    <View style={styles.colUT}>
                      <Text style={styles.cellText}>
                        {entry.undertime_minutes > 0
                          ? String(entry.undertime_minutes)
                          : ""}
                      </Text>
                    </View>
                    <View style={styles.colRemarks}>
                      <Text style={styles.cellText}>
                        {entry.leave_type && !entry.is_absent
                          ? entry.leave_type
                          : entry.is_absent && !isWeekend
                          ? "ABSENT"
                          : isWeekend
                          ? ""
                          : entry.remarks ?? ""}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.summarySection} wrap={false}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Days Present:</Text>
                <Text style={styles.summaryValue}>{summary.total_days_present}</Text>
                <Text style={styles.summaryLabel}>Total Days Absent:</Text>
                <Text style={styles.summaryValue}>{summary.total_days_absent}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Days on Leave:</Text>
                <Text style={styles.summaryValue}>{summary.total_days_on_leave}</Text>
                <Text style={styles.summaryLabel}> </Text>
                <Text style={styles.summaryValue}> </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Late (times / minutes):</Text>
                <Text style={styles.summaryValue}>
                  {summary.total_late_count} / {summary.total_late_minutes}
                </Text>
                <Text style={styles.summaryLabel}>Total Undertime (times / minutes):</Text>
                <Text style={styles.summaryValue}>
                  {summary.total_undertime_count} / {summary.total_undertime_minutes}
                </Text>
              </View>
            </View>

            <View wrap={false}>
              <Text style={styles.certification}>
                I certify on my honor that the above is a true and correct report of
                the hours of work performed, record of which was made daily at the
                time of arrival at and departure from office.
              </Text>

              <View style={styles.signatureSection}>
                <View style={styles.signatureBlock}>
                  <Text style={styles.signatureLine}>Employee&apos;s Signature</Text>
                </View>
                <View style={styles.signatureBlock}>
                  <Text style={styles.signatureLine}>
                    Verified as to the prescribed office hours
                  </Text>
                </View>
              </View>

              <View
                style={{
                  ...styles.signatureSection,
                  marginTop: 15,
                }}
              >
                <View style={styles.signatureBlock}>
                  <Text style={{ fontSize: 7 }}> </Text>
                </View>
                <View style={styles.signatureBlock}>
                  <Text style={styles.signatureLine}>
                    Head of Office / Authorized Representative
                  </Text>
                </View>
              </View>

              <Text style={styles.cscNote}>CS Form No. 48 (Revised 2018)</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
