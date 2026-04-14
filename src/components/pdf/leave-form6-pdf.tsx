import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Helvetica" },
  header: { textAlign: "center", marginBottom: 10 },
  title: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, marginBottom: 2 },
  formNo: { fontSize: 8, textAlign: "right", marginBottom: 10, color: "#666" },

  // Table-like form layout
  box: { border: "1pt solid #000", marginBottom: 0 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #000", minHeight: 20 },
  rowNoBorder: { flexDirection: "row", minHeight: 20 },
  cellLabel: {
    width: "35%",
    padding: 4,
    fontSize: 8,
    borderRight: "0.5pt solid #000",
    backgroundColor: "#f5f5f5",
  },
  cellValue: { flex: 1, padding: 4, fontSize: 9 },
  cellHalf: { width: "50%", padding: 4, borderRight: "0.5pt solid #000" },

  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#e0e0e0",
    padding: 4,
    borderBottom: "0.5pt solid #000",
    textAlign: "center",
  },

  // Credits section
  creditTable: { flexDirection: "row", borderBottom: "0.5pt solid #000" },
  creditHeader: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    padding: 3,
    textAlign: "center",
    borderRight: "0.5pt solid #000",
    backgroundColor: "#f0f0f0",
  },
  creditCell: {
    fontSize: 8,
    padding: 3,
    textAlign: "center",
    borderRight: "0.5pt solid #000",
  },

  signatureSection: { marginTop: 30, flexDirection: "row", justifyContent: "space-between" },
  signatureBlock: { width: "28%", textAlign: "center" },
  signatureLine: {
    borderTop: "1pt solid #000",
    marginTop: 35,
    paddingTop: 3,
    fontSize: 7,
  },
  signatureTitle: { fontSize: 7, color: "#666", marginTop: 1 },
  footer: { fontSize: 7, color: "#666", marginTop: 20, textAlign: "center", fontStyle: "italic" },
});

interface LeaveForm6PdfProps {
  employeeName: string;
  employeeNo: string;
  position: string;
  department: string;
  leaveType: string;
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  daysApplied: number;
  reason: string | null;
  totalCredits: number;
  usedCredits: number;
  balance: number;
  status: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function LeaveForm6Pdf({
  employeeName,
  employeeNo,
  position,
  department,
  leaveType,
  leaveTypeCode,
  startDate,
  endDate,
  daysApplied,
  reason,
  totalCredits,
  usedCredits,
  balance,
  status,
}: LeaveForm6PdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.subtitle}>Local Government Unit</Text>
        </View>
        <Text style={styles.formNo}>CSC Form No. 6{"\n"}Revised 2020</Text>
        <Text style={styles.title}>APPLICATION FOR LEAVE</Text>

        {/* Section 1: Employee Information */}
        <View style={styles.box}>
          <Text style={styles.sectionTitle}>1. OFFICE/DEPARTMENT</Text>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Office/Department</Text>
            <Text style={styles.cellValue}>{department}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Name</Text>
            <Text style={styles.cellValue}>{employeeName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Employee No.</Text>
            <Text style={styles.cellValue}>{employeeNo}</Text>
          </View>
          <View style={styles.rowNoBorder}>
            <Text style={styles.cellLabel}>Position</Text>
            <Text style={styles.cellValue}>{position}</Text>
          </View>
        </View>

        {/* Section 2: Details of Application */}
        <View style={{ ...styles.box, marginTop: 8 }}>
          <Text style={styles.sectionTitle}>2. DETAILS OF APPLICATION</Text>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Type of Leave</Text>
            <Text style={styles.cellValue}>{leaveType} ({leaveTypeCode})</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Inclusive Dates</Text>
            <Text style={styles.cellValue}>
              {formatDate(startDate)} to {formatDate(endDate)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.cellLabel}>Number of Working Days</Text>
            <Text style={styles.cellValue}>{daysApplied} day(s)</Text>
          </View>
          <View style={styles.rowNoBorder}>
            <Text style={styles.cellLabel}>Reason/Details</Text>
            <Text style={styles.cellValue}>{reason || "—"}</Text>
          </View>
        </View>

        {/* Section 3: Leave Credits Certification */}
        <View style={{ ...styles.box, marginTop: 8 }}>
          <Text style={styles.sectionTitle}>3. CERTIFICATION OF LEAVE CREDITS</Text>
          <Text style={{ fontSize: 8, padding: 4 }}>
            As of filing of this application, the leave credits of the applicant are as follows:
          </Text>
          <View style={styles.creditTable}>
            <Text style={{ ...styles.creditHeader, width: "34%" }}>Leave Type</Text>
            <Text style={{ ...styles.creditHeader, width: "22%" }}>Total Earned</Text>
            <Text style={{ ...styles.creditHeader, width: "22%" }}>Less: Used</Text>
            <Text style={{ ...styles.creditHeader, width: "22%", borderRight: "none" }}>Balance</Text>
          </View>
          <View style={styles.creditTable}>
            <Text style={{ ...styles.creditCell, width: "34%", textAlign: "left" }}>{leaveType}</Text>
            <Text style={{ ...styles.creditCell, width: "22%" }}>{totalCredits}</Text>
            <Text style={{ ...styles.creditCell, width: "22%" }}>{usedCredits}</Text>
            <Text style={{ ...styles.creditCell, width: "22%", borderRight: "none", fontFamily: "Helvetica-Bold" }}>
              {balance}
            </Text>
          </View>
        </View>

        {/* Section 4: Recommendation/Approval */}
        <View style={{ ...styles.box, marginTop: 8 }}>
          <Text style={styles.sectionTitle}>4. RECOMMENDATION</Text>
          <View style={styles.row}>
            <View style={styles.cellHalf}>
              <Text style={{ fontSize: 8, marginBottom: 2 }}>Supervisor/Department Head:</Text>
              <Text style={{ fontSize: 8 }}>
                {status === "approved"
                  ? "[ X ] Approved"
                  : status === "rejected"
                    ? "[ X ] Disapproved"
                    : "[ ] Approved  [ ] Disapproved"}
              </Text>
            </View>
            <View style={{ ...styles.cellHalf, borderRight: "none" }}>
              <Text style={{ fontSize: 8, marginBottom: 2 }}>HR Officer / Authorized Official:</Text>
              <Text style={{ fontSize: 8 }}>
                {status === "approved"
                  ? "[ X ] Approved"
                  : status === "rejected"
                    ? "[ X ] Disapproved"
                    : "[ ] Approved  [ ] Disapproved"}
              </Text>
            </View>
          </View>
        </View>

        {/* Signatures */}
        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Applicant</Text>
            <Text style={styles.signatureTitle}>{employeeName}</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Department Head</Text>
            <Text style={styles.signatureTitle}>Recommending Approval</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>HR Officer / Authorized Official</Text>
            <Text style={styles.signatureTitle}>Approved by</Text>
          </View>
        </View>

        <Text style={styles.footer}>CSC Form No. 6 — Application for Leave</Text>
      </Page>
    </Document>
  );
}
