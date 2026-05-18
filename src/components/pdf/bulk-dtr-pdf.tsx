import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { BulkDtrResult } from "@/lib/actions/attendance-actions";
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

interface BulkDtrPdfProps {
  results: BulkDtrResult[];
  departmentName: string;
  periodLabel: string;
}

export function BulkDtrPdf({ results, departmentName, periodLabel }: BulkDtrPdfProps) {
  return (
    <Document>
      {results.map(({ employee, entries, summary }) => {
        const fullName = [employee.first_name, employee.middle_name, employee.last_name]
          .filter(Boolean)
          .join(" ");
        const position = getEffectivePosition(employee) ?? "";
        const office = employee.departments?.name ?? departmentName;
        const verifyTitle = position || office || "In Charge";

        return (
          <Page
            key={employee.id}
            size="LEGAL"
            orientation="portrait"
            style={styles.page}
          >
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
        );
      })}
    </Document>
  );
}
