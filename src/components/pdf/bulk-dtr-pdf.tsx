import { Document, Page, StyleSheet, View } from "@react-pdf/renderer";
import type { BulkDtrResult } from "@/lib/actions/attendance-actions";
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
  periodLabel: string;
}

export function BulkDtrPdf({ results, periodLabel }: BulkDtrPdfProps) {
  return (
    <Document>
      {results.map(({ employee, entries, summary, schedule, signatory }) => {
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
            <View style={styles.pair}>
              <View style={styles.half}>
                <DtrFormColumn
                  entries={entries}
                  summary={summary}
                  employeeName={fullName}
                  periodLabel={periodLabel}
                  schedule={schedule}
                  signatory={signatory}
                />
              </View>
              <View style={styles.half}>
                <DtrFormColumn
                  entries={entries}
                  summary={summary}
                  employeeName={fullName}
                  periodLabel={periodLabel}
                  schedule={schedule}
                  signatory={signatory}
                />
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
