import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { DtrEntry, DtrSummary } from "@/lib/actions/attendance-actions";
import { getEffectivePosition } from "@/lib/employee-position";
import { DtrFormColumn } from "@/components/pdf/dtr-form-column";

const styles = StyleSheet.create({
  page: {
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 12,
    fontFamily: "Helvetica",
  },
  pair: {
    flexDirection: "row",
    width: "100%",
  },
  half: {
    flexBasis: "50%",
    flexGrow: 0,
    flexShrink: 0,
    width: "50%",
  },
});

interface DtrPdfProps {
  entries: DtrEntry[];
  summary: DtrSummary;
  employee: {
    first_name: string;
    last_name: string;
    middle_name: string | null;
    departments: { name: string } | null;
    positions: { title: string } | null;
    plantilla: { position_title: string | null }[] | null;
  };
  month: string;
  year: string;
}

export function DtrPdf({ entries, summary, employee, month, year }: DtrPdfProps) {
  const fullName = [employee.first_name, employee.middle_name, employee.last_name]
    .filter(Boolean)
    .join(" ");
  const periodLabel = `${month.toUpperCase()} ${year}`;
  const position = getEffectivePosition(employee) ?? "";
  const office = employee.departments?.name ?? "";
  const verifyTitle = position || office || "In Charge";

  return (
    <Document>
      <Page size="LEGAL" orientation="portrait" style={styles.page}>
        <View style={styles.pair}>
          <View style={styles.half}>
            <DtrFormColumn
              entries={entries}
              summary={summary}
              employeeName={fullName}
              periodLabel={periodLabel}
              verifiedByTitle={verifyTitle}
            />
          </View>
          <View style={styles.half}>
            <DtrFormColumn
              entries={entries}
              summary={summary}
              employeeName={fullName}
              periodLabel={periodLabel}
              verifiedByTitle={verifyTitle}
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}
