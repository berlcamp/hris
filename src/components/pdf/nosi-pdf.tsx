import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 50, fontSize: 10, fontFamily: "Helvetica" },
  header: { textAlign: "center", marginBottom: 20 },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 10, marginBottom: 4 },
  formTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 20,
    textDecoration: "underline",
  },
  section: { marginBottom: 15 },
  row: { flexDirection: "row", marginBottom: 6 },
  label: { width: 160, fontFamily: "Helvetica-Bold" },
  value: { flex: 1, borderBottom: "0.5pt solid #999", paddingBottom: 2 },
  salarySection: {
    marginTop: 10,
    marginBottom: 10,
    border: "1pt solid #000",
    padding: 12,
  },
  salaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  salaryBox: { width: "45%", textAlign: "center" },
  salaryLabel: { fontSize: 8, color: "#666", marginBottom: 2 },
  salaryValue: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  arrow: { fontSize: 16, alignSelf: "center" },
  signatureSection: { marginTop: 50, flexDirection: "row", justifyContent: "space-between" },
  signatureBlock: { width: "30%", textAlign: "center" },
  signatureLine: { borderTop: "1pt solid #000", marginTop: 40, paddingTop: 4, fontSize: 8 },
  signatureTitle: { fontSize: 7, color: "#666" },
  footer: { fontSize: 7, color: "#666", marginTop: 30, textAlign: "center", fontStyle: "italic" },
});

interface NosiPdfProps {
  employeeName: string;
  employeeNo: string;
  position: string;
  department: string;
  currentSalaryGrade: number;
  currentStep: number;
  newStep: number;
  currentSalary: number;
  newSalary: number;
  effectiveDate: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatPHP(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

export function NosiPdf({
  employeeName,
  employeeNo,
  position,
  department,
  currentSalaryGrade,
  currentStep,
  newStep,
  currentSalary,
  newSalary,
  effectiveDate,
}: NosiPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.subtitle}>Local Government Unit</Text>
          <Text style={styles.title}>NOTICE OF STEP INCREMENT</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Employee Name:</Text>
            <Text style={styles.value}>{employeeName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Employee No:</Text>
            <Text style={styles.value}>{employeeNo}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Position:</Text>
            <Text style={styles.value}>{position}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Department/Office:</Text>
            <Text style={styles.value}>{department}</Text>
          </View>
        </View>

        <Text style={{ marginBottom: 10 }}>
          This is to inform you that pursuant to the provisions of the compensation and position classification system, you are hereby granted a step increment as follows:
        </Text>

        <View style={styles.salarySection}>
          <View style={styles.row}>
            <Text style={styles.label}>Salary Grade:</Text>
            <Text style={styles.value}>{currentSalaryGrade}</Text>
          </View>
          <View style={styles.salaryRow}>
            <View style={styles.salaryBox}>
              <Text style={styles.salaryLabel}>CURRENT STEP / SALARY</Text>
              <Text style={styles.salaryValue}>Step {currentStep}</Text>
              <Text>{formatPHP(currentSalary)}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
            <View style={styles.salaryBox}>
              <Text style={styles.salaryLabel}>NEW STEP / SALARY</Text>
              <Text style={styles.salaryValue}>Step {newStep}</Text>
              <Text>{formatPHP(newSalary)}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Effective Date:</Text>
            <Text style={styles.value}>{formatDate(effectiveDate)}</Text>
          </View>
        </View>

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>HR Officer</Text>
            <Text style={styles.signatureTitle}>Prepared by</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Department Head</Text>
            <Text style={styles.signatureTitle}>Reviewed by</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>Local Chief Executive</Text>
            <Text style={styles.signatureTitle}>Approved by</Text>
          </View>
        </View>

        <Text style={styles.footer}>CSC NOSI Form</Text>
      </Page>
    </Document>
  );
}
