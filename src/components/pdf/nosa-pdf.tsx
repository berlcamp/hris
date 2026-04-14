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

interface NosaPdfProps {
  employeeName: string;
  employeeNo: string;
  position: string;
  department: string;
  previousSalaryGrade: number;
  previousStep: number;
  previousSalary: number;
  newSalaryGrade: number;
  newStep: number;
  newSalary: number;
  reason: string;
  legalBasis: string | null;
  effectiveDate: string;
}

const reasonLabels: Record<string, string> = {
  promotion: "Promotion",
  reclassification: "Reclassification",
  salary_standardization: "Salary Standardization",
  adjustment: "Adjustment",
  demotion: "Demotion",
  initial: "Initial Appointment",
  step_increment: "Step Increment",
};

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

export function NosaPdf({
  employeeName,
  employeeNo,
  position,
  department,
  previousSalaryGrade,
  previousStep,
  previousSalary,
  newSalaryGrade,
  newStep,
  newSalary,
  reason,
  legalBasis,
  effectiveDate,
}: NosaPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.subtitle}>Local Government Unit</Text>
          <Text style={styles.title}>NOTICE OF SALARY ADJUSTMENT</Text>
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
          This is to inform you that your salary has been adjusted effective {formatDate(effectiveDate)} by reason of {reasonLabels[reason] ?? reason}.
        </Text>

        <View style={styles.salarySection}>
          <View style={styles.salaryRow}>
            <View style={styles.salaryBox}>
              <Text style={styles.salaryLabel}>PREVIOUS</Text>
              <Text style={styles.salaryValue}>SG {previousSalaryGrade} — Step {previousStep}</Text>
              <Text>{formatPHP(previousSalary)}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
            <View style={styles.salaryBox}>
              <Text style={styles.salaryLabel}>NEW</Text>
              <Text style={styles.salaryValue}>SG {newSalaryGrade} — Step {newStep}</Text>
              <Text>{formatPHP(newSalary)}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Reason:</Text>
            <Text style={styles.value}>{reasonLabels[reason] ?? reason}</Text>
          </View>
          {legalBasis && (
            <View style={styles.row}>
              <Text style={styles.label}>Legal Basis:</Text>
              <Text style={styles.value}>{legalBasis}</Text>
            </View>
          )}
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

        <Text style={styles.footer}>NOSA Form</Text>
      </Page>
    </Document>
  );
}
