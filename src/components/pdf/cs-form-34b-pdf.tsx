import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 50, fontSize: 10, fontFamily: "Helvetica" },
  formNo: { fontSize: 8, marginBottom: 2 },
  header: { textAlign: "center", marginBottom: 14 },
  subtitle: { fontSize: 10, marginBottom: 2 },
  lgu: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  formTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 9,
    textAlign: "center",
    color: "#444",
    marginBottom: 20,
  },
  body: { lineHeight: 1.6, marginBottom: 10, textAlign: "justify" },
  bold: { fontFamily: "Helvetica-Bold" },
  signatures: {
    marginTop: 40,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  signatureBlock: { width: "40%", textAlign: "center", marginBottom: 24 },
  signatureLine: {
    borderTop: "1pt solid #000",
    marginTop: 34,
    paddingTop: 4,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  signatureTitle: { fontSize: 8, color: "#444" },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 50,
    right: 50,
    fontSize: 7,
    color: "#666",
    textAlign: "center",
    fontStyle: "italic",
  },
});

function formatDate(dateStr: string | null) {
  if (!dateStr) return "_______________";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export interface CsForm34bSignatory {
  name: string;
  position: string;
}

export interface CsForm34bPdfProps {
  lguName: string;
  lguAddress: string;
  appointeeName: string;
  positionTitle: string;
  itemNumber: string | null;
  organizationalUnit: string | null;
  publicationDate: string | null;
  closingDate: string | null;
  deliberationDate: string | null;
  signatories: CsForm34bSignatory[];
}

export function CsForm34bPdf(props: CsForm34bPdfProps) {
  const signatories =
    props.signatories.length > 0
      ? props.signatories
      : [
          { name: "", position: "HRMPSB Chairperson" },
          { name: "", position: "HRMPSB Member" },
          { name: "", position: "HRMPSB Member" },
          { name: "", position: "HRMPSB Member" },
        ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.formNo}>CS Form No. 34-B (Revised 2018)</Text>
        <View style={styles.header}>
          <Text style={styles.subtitle}>Republic of the Philippines</Text>
          <Text style={styles.lgu}>{props.lguName}</Text>
          {props.lguAddress ? (
            <Text style={styles.subtitle}>{props.lguAddress}</Text>
          ) : null}
        </View>

        <Text style={styles.formTitle}>
          CERTIFICATION OF THE HUMAN RESOURCE MERIT PROMOTION AND SELECTION
          BOARD (HRMPSB)
        </Text>
        <Text style={styles.formSubtitle}>
          Pursuant to the 2017 Omnibus Rules on Appointments and Other Human
          Resource Actions (ORAOHRA), as amended
        </Text>

        <Text style={styles.body}>
          This is to certify that the vacant position of{" "}
          <Text style={styles.bold}>{props.positionTitle}</Text> (Plantilla
          Item No. <Text style={styles.bold}>{props.itemNumber ?? "____"}</Text>
          {props.organizationalUnit ? (
            <>
              , <Text style={styles.bold}>{props.organizationalUnit}</Text>
            </>
          ) : null}
          ) was published on{" "}
          <Text style={styles.bold}>{formatDate(props.publicationDate)}</Text>{" "}
          with deadline of submission of applications on{" "}
          <Text style={styles.bold}>{formatDate(props.closingDate)}</Text>, in
          accordance with Republic Act No. 7041.
        </Text>

        <Text style={styles.body}>
          This further certifies that{" "}
          <Text style={styles.bold}>{props.appointeeName}</Text> was among the
          candidates evaluated and comparatively assessed by the HRMPSB in its
          deliberation held on{" "}
          <Text style={styles.bold}>{formatDate(props.deliberationDate)}</Text>
          , in accordance with the agency&apos;s Merit Selection Plan, and that
          the assessment was conducted without discrimination on account of
          age, sex, sexual orientation and gender identity, civil status,
          disability, religion, ethnicity, or political affiliation.
        </Text>

        <Text style={styles.body}>
          This certification is issued in support of the appointment of the
          aforementioned appointee.
        </Text>

        <View style={styles.signatures}>
          {signatories.map((s, i) => (
            <View key={i} style={styles.signatureBlock}>
              <Text style={styles.signatureLine}>{s.name || " "}</Text>
              <Text style={styles.signatureTitle}>{s.position}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          CS Form No. 34-B — Certification by the HRMPSB (for appointments in
          local government units).
        </Text>
      </Page>
    </Document>
  );
}
