import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import type { ServiceRecord } from "@/lib/types";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
  },
  header: {
    textAlign: "center",
    marginBottom: 15,
  },
  title: {
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: "Helvetica-Bold",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    marginBottom: 4,
  },
  formTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 10,
    textDecoration: "underline",
  },
  employeeInfo: {
    marginBottom: 10,
    borderBottom: "1pt solid #000",
    paddingBottom: 6,
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  infoLabel: {
    width: 100,
    fontFamily: "Helvetica-Bold",
  },
  infoValue: {
    flex: 1,
    borderBottom: "0.5pt solid #999",
  },
  table: {
    marginTop: 5,
  },
  tableHeader: {
    flexDirection: "row",
    borderTop: "1pt solid #000",
    borderBottom: "1pt solid #000",
    backgroundColor: "#f0f0f0",
    paddingVertical: 4,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #ccc",
    paddingVertical: 3,
    minHeight: 18,
  },
  colFrom: { width: "11%", paddingHorizontal: 2 },
  colTo: { width: "11%", paddingHorizontal: 2 },
  colDesignation: { width: "22%", paddingHorizontal: 2 },
  colStatus: { width: "10%", paddingHorizontal: 2 },
  colSalary: { width: "13%", paddingHorizontal: 2, textAlign: "right" },
  colOffice: { width: "18%", paddingHorizontal: 2 },
  colLwop: { width: "7%", paddingHorizontal: 2, textAlign: "center" },
  colRemarks: { width: "8%", paddingHorizontal: 2 },
  headerText: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    textAlign: "center",
  },
  cellText: {
    fontSize: 8,
  },
  footer: {
    marginTop: 20,
    fontSize: 8,
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 40,
  },
  signatureBlock: {
    width: "40%",
    textAlign: "center",
  },
  signatureLine: {
    borderTop: "1pt solid #000",
    marginTop: 30,
    paddingTop: 3,
    fontSize: 8,
  },
  cscNote: {
    fontSize: 7,
    color: "#666",
    marginTop: 15,
    textAlign: "center",
    fontStyle: "italic",
  },
});

interface ServiceRecordPdfProps {
  employeeName: string;
  employeeNo: string;
  birthDate: string | null;
  records: ServiceRecord[];
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ServiceRecordPdf({
  employeeName,
  employeeNo,
  birthDate,
  records,
}: ServiceRecordPdfProps) {
  return (
    <Document>
      <Page size="LEGAL" orientation="portrait" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.subtitle}>Local Government Unit</Text>
          <Text style={styles.title}>SERVICE RECORD</Text>
        </View>

        {/* Employee Info */}
        <View style={styles.employeeInfo}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name:</Text>
            <Text style={styles.infoValue}>{employeeName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Employee No:</Text>
            <Text style={styles.infoValue}>{employeeNo}</Text>
          </View>
          {birthDate && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date of Birth:</Text>
              <Text style={styles.infoValue}>{formatDate(birthDate)}</Text>
            </View>
          )}
        </View>

        <Text style={styles.formTitle}>
          This is to certify that the employee named above has rendered the
          following services:
        </Text>

        {/* Table */}
        <View style={styles.table}>
          {/* Table Header */}
          <View style={styles.tableHeader}>
            <View style={styles.colFrom}>
              <Text style={styles.headerText}>FROM</Text>
            </View>
            <View style={styles.colTo}>
              <Text style={styles.headerText}>TO</Text>
            </View>
            <View style={styles.colDesignation}>
              <Text style={styles.headerText}>DESIGNATION</Text>
            </View>
            <View style={styles.colStatus}>
              <Text style={styles.headerText}>STATUS</Text>
            </View>
            <View style={styles.colSalary}>
              <Text style={styles.headerText}>SALARY</Text>
            </View>
            <View style={styles.colOffice}>
              <Text style={styles.headerText}>STATION/PLACE</Text>
            </View>
            <View style={styles.colLwop}>
              <Text style={styles.headerText}>LWOP</Text>
            </View>
            <View style={styles.colRemarks}>
              <Text style={styles.headerText}>REMARKS</Text>
            </View>
          </View>

          {/* Table Rows */}
          {records.map((record, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={styles.colFrom}>
                <Text style={styles.cellText}>
                  {formatDate(record.date_from)}
                </Text>
              </View>
              <View style={styles.colTo}>
                <Text style={styles.cellText}>
                  {record.date_to ? formatDate(record.date_to) : "Present"}
                </Text>
              </View>
              <View style={styles.colDesignation}>
                <Text style={styles.cellText}>{record.designation}</Text>
              </View>
              <View style={styles.colStatus}>
                <Text style={styles.cellText}>
                  {record.status_type ?? ""}
                </Text>
              </View>
              <View style={styles.colSalary}>
                <Text style={styles.cellText}>
                  {record.salary
                    ? `₱${Number(record.salary).toLocaleString("en-PH", {
                        minimumFractionDigits: 2,
                      })}`
                    : ""}
                </Text>
              </View>
              <View style={styles.colOffice}>
                <Text style={styles.cellText}>{record.office ?? ""}</Text>
              </View>
              <View style={styles.colLwop}>
                <Text style={styles.cellText}>
                  {record.leave_without_pay > 0
                    ? String(record.leave_without_pay)
                    : ""}
                </Text>
              </View>
              <View style={styles.colRemarks}>
                <Text style={styles.cellText}>{record.remarks ?? ""}</Text>
              </View>
            </View>
          ))}

          {/* Empty rows for padding */}
          {records.length < 5 &&
            Array.from({ length: 5 - records.length }).map((_, i) => (
              <View key={`empty-${i}`} style={styles.tableRow}>
                <View style={styles.colFrom}>
                  <Text style={styles.cellText}> </Text>
                </View>
                <View style={styles.colTo}>
                  <Text style={styles.cellText}> </Text>
                </View>
                <View style={styles.colDesignation}>
                  <Text style={styles.cellText}> </Text>
                </View>
                <View style={styles.colStatus}>
                  <Text style={styles.cellText}> </Text>
                </View>
                <View style={styles.colSalary}>
                  <Text style={styles.cellText}> </Text>
                </View>
                <View style={styles.colOffice}>
                  <Text style={styles.cellText}> </Text>
                </View>
                <View style={styles.colLwop}>
                  <Text style={styles.cellText}> </Text>
                </View>
                <View style={styles.colRemarks}>
                  <Text style={styles.cellText}> </Text>
                </View>
              </View>
            ))}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text>
            Issued in compliance with Executive Order No. 54 dated August 10,
            1954, and in accordance with Circular No. 58, dated August 10, 1954
            of the system.
          </Text>
        </View>

        {/* Signatures */}
        <View style={styles.signatureRow}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Prepared by</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>
              Head of Office/Authorized Representative
            </Text>
          </View>
        </View>

        <Text style={styles.cscNote}>
          CSC Form No. 33-B (Revised 2018)
        </Text>
      </Page>
    </Document>
  );
}
