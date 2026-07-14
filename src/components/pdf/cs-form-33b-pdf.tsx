import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 46, fontSize: 10, fontFamily: "Helvetica" },
  formNo: { fontSize: 8, marginBottom: 2 },
  header: { textAlign: "center", marginBottom: 12 },
  subtitle: { fontSize: 10, marginBottom: 2 },
  lgu: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  body: { lineHeight: 1.5, marginBottom: 8 },
  name: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginVertical: 8,
  },
  underlineValue: { fontFamily: "Helvetica-Bold", textDecoration: "underline" },
  checkboxSection: { marginVertical: 8 },
  checkboxTitle: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  checkboxGrid: { flexDirection: "row", flexWrap: "wrap" },
  checkboxItem: { width: "25%", flexDirection: "row", marginBottom: 3 },
  box: {
    width: 9,
    height: 9,
    border: "1pt solid #000",
    marginRight: 4,
    textAlign: "center",
    fontSize: 8,
  },
  signatureSection: {
    marginTop: 30,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  signatureBlock: { width: "45%", textAlign: "center" },
  signatureLine: {
    borderTop: "1pt solid #000",
    marginTop: 34,
    paddingTop: 3,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  signatureTitle: { fontSize: 8, color: "#444" },
  certBox: { border: "1pt solid #000", padding: 10, marginTop: 14 },
  certTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 6,
  },
  certBody: { fontSize: 9, lineHeight: 1.5 },
  backTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 14,
  },
  fieldRow: { flexDirection: "row", marginBottom: 8 },
  fieldLabel: { width: 170, fontFamily: "Helvetica-Bold" },
  fieldValue: { flex: 1, borderBottom: "0.5pt solid #999", paddingBottom: 2 },
});

const NATURES = [
  { value: "original", label: "Original" },
  { value: "promotion", label: "Promotion" },
  { value: "transfer", label: "Transfer" },
  { value: "reemployment", label: "Reemployment" },
  { value: "reappointment", label: "Reappointment" },
  { value: "reclassification", label: "Reclassification" },
  { value: "demotion", label: "Demotion" },
  { value: "others", label: "Others" },
];

const STATUS_TYPES = [
  { value: "permanent", label: "Permanent" },
  { value: "temporary", label: "Temporary" },
  { value: "coterminous", label: "Coterminous" },
  { value: "casual", label: "Casual" },
  { value: "contractual", label: "Contractual" },
  { value: "substitute", label: "Substitute" },
  { value: "provisional", label: "Provisional" },
];

function formatDate(dateStr: string | null) {
  if (!dateStr) return "_______________";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatPHP(n: number | null) {
  if (n == null) return "_______________";
  return `PHP ${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

export interface CsForm33bPdfProps {
  lguName: string;
  lguAddress: string;
  appointeeName: string;
  positionTitle: string;
  itemNumber: string | null;
  organizationalUnit: string | null;
  salaryGrade: number | null;
  monthlySalary: number | null;
  nature: string;
  natureOthers: string | null;
  statusType: string;
  vice: string | null;
  employmentPeriodFrom: string | null;
  employmentPeriodTo: string | null;
  dateOfSigning: string | null;
  appointingAuthority: string | null;
  appointingAuthorityPosition: string | null;
  publicationDate: string | null;
  closingDate: string | null;
  deliberationDate: string | null;
  oathDate: string | null;
  assumptionDate: string | null;
}

function CheckboxGrid({
  title,
  options,
  selected,
  othersText,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string;
  othersText?: string | null;
}) {
  return (
    <View style={styles.checkboxSection}>
      <Text style={styles.checkboxTitle}>{title}</Text>
      <View style={styles.checkboxGrid}>
        {options.map((o) => (
          <View key={o.value} style={styles.checkboxItem}>
            <Text style={styles.box}>{selected === o.value ? "X" : " "}</Text>
            <Text>
              {o.label}
              {o.value === "others" && selected === "others" && othersText
                ? `: ${othersText}`
                : ""}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CsForm33bPdf(props: CsForm33bPdfProps) {
  return (
    <Document>
      {/* Front */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.formNo}>CS Form No. 33-B (Revised 2017)</Text>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.lgu}>{props.lguName}</Text>
          {props.lguAddress ? (
            <Text style={styles.subtitle}>{props.lguAddress}</Text>
          ) : null}
        </View>

        <Text style={styles.name}>{props.appointeeName}</Text>

        <Text style={styles.body}>
          You are hereby appointed as{" "}
          <Text style={styles.underlineValue}>{props.positionTitle}</Text>
          {props.organizationalUnit ? (
            <>
              {" "}
              at the{" "}
              <Text style={styles.underlineValue}>
                {props.organizationalUnit}
              </Text>
            </>
          ) : null}{" "}
          ({props.salaryGrade != null ? `SG ${props.salaryGrade}` : "SG ____"})
          with a compensation rate of{" "}
          <Text style={styles.underlineValue}>
            {formatPHP(props.monthlySalary)}
          </Text>{" "}
          per month under Plantilla Item No.{" "}
          <Text style={styles.underlineValue}>
            {props.itemNumber ?? "_______________"}
          </Text>
          {props.vice ? (
            <>
              , vice <Text style={styles.underlineValue}>{props.vice}</Text>
            </>
          ) : null}
          .
        </Text>

        <CheckboxGrid
          title="Nature of Appointment:"
          options={NATURES}
          selected={props.nature}
          othersText={props.natureOthers}
        />
        <CheckboxGrid
          title="Status of Appointment:"
          options={STATUS_TYPES}
          selected={props.statusType}
        />

        {(props.employmentPeriodFrom || props.employmentPeriodTo) && (
          <Text style={styles.body}>
            Employment period from{" "}
            <Text style={styles.underlineValue}>
              {formatDate(props.employmentPeriodFrom)}
            </Text>{" "}
            to{" "}
            <Text style={styles.underlineValue}>
              {formatDate(props.employmentPeriodTo)}
            </Text>
            .
          </Text>
        )}

        <Text style={styles.body}>
          Date of Signing:{" "}
          <Text style={styles.underlineValue}>
            {formatDate(props.dateOfSigning)}
          </Text>
        </Text>

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>
              {props.appointingAuthority || " "}
            </Text>
            <Text style={styles.signatureTitle}>
              {props.appointingAuthorityPosition || "Appointing Authority"}
            </Text>
          </View>
        </View>

        <View style={styles.certBox}>
          <Text style={styles.certTitle}>CERTIFICATION</Text>
          <Text style={styles.certBody}>
            This is to certify that the vacant position was published on{" "}
            {formatDate(props.publicationDate)} with deadline of application on{" "}
            {formatDate(props.closingDate)} in accordance with RA 7041, and
            that the appointee was assessed and deliberated upon by the Human
            Resource Merit Promotion and Selection Board on{" "}
            {formatDate(props.deliberationDate)} in accordance with the
            agency&apos;s Merit Selection Plan and the 2017 ORAOHRA.
          </Text>
          <View style={styles.signatureSection}>
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLine}> </Text>
              <Text style={styles.signatureTitle}>
                Human Resource Management Officer
              </Text>
            </View>
          </View>
        </View>
      </Page>

      {/* Back — oath and assumption */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.formNo}>CS Form No. 33-B (Revised 2017) — back</Text>
        <Text style={styles.backTitle}>
          OATH OF OFFICE AND CERTIFICATION OF ASSUMPTION TO DUTY
        </Text>

        <View style={styles.certBox}>
          <Text style={styles.certTitle}>PANUNUMPA SA KATUNGKULAN (OATH OF OFFICE)</Text>
          <Text style={styles.certBody}>
            I, {props.appointeeName}, having been appointed to the position of{" "}
            {props.positionTitle}, hereby solemnly swear that I will faithfully
            discharge to the best of my ability the duties of my position and
            of all others that I may hereafter hold, and that I will support
            and defend the Constitution of the Republic of the Philippines, and
            obey the laws, legal orders, and decrees promulgated by its duly
            constituted authorities; and that I impose this obligation upon
            myself voluntarily, without mental reservation or purpose of
            evasion. So help me God.
          </Text>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>Date of Oath:</Text>
            <Text style={styles.fieldValue}>{formatDate(props.oathDate)}</Text>
          </View>
          <View style={styles.signatureSection}>
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLine}>{props.appointeeName}</Text>
              <Text style={styles.signatureTitle}>Appointee</Text>
            </View>
          </View>
          <View style={styles.signatureSection}>
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLine}> </Text>
              <Text style={styles.signatureTitle}>
                Officer Administering the Oath
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.certBox}>
          <Text style={styles.certTitle}>
            CERTIFICATION OF ASSUMPTION TO DUTY
          </Text>
          <Text style={styles.certBody}>
            This is to certify that {props.appointeeName} assumed the duties
            and responsibilities of the position of {props.positionTitle} on{" "}
            {formatDate(props.assumptionDate)}.
          </Text>
          <View style={styles.signatureSection}>
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLine}> </Text>
              <Text style={styles.signatureTitle}>
                Head of Office / Immediate Supervisor
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
