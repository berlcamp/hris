import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  contractDocToBlocks,
  type ContractBlock,
  type TiptapNode,
} from "@/lib/cos-contract-doc";
import type { MergeContext } from "@/lib/cos-merge-fields";

const styles = StyleSheet.create({
  page: { padding: 56, fontSize: 11, fontFamily: "Times-Roman", lineHeight: 1.5 },
  title: { fontSize: 14, fontFamily: "Times-Bold", textAlign: "center", marginBottom: 24 },
  paragraph: { marginBottom: 10, textAlign: "justify" },
  listRow: { flexDirection: "row", marginBottom: 6, paddingLeft: 18 },
  listMarker: { width: 22 },
  listBody: { flex: 1, textAlign: "justify" },
  signatureSection: { marginTop: 56, flexDirection: "row", justifyContent: "space-between" },
  signatureBlock: { width: "45%", textAlign: "center" },
  signatureLine: { borderTop: "1pt solid #000", marginTop: 40, paddingTop: 4 },
  signatureRole: { fontSize: 9, color: "#444" },
});

/**
 * One block's runs, each carrying its own bold/italic/underline flags.
 *
 * A run's `text` can legitimately be the literal string "\n" — toRuns() in
 * cos-contract-doc.ts emits that for a hardBreak node instead of dropping it
 * (dropping it would silently run the surrounding text together). Rendering
 * it as its own <Text> here still works: react-pdf flattens a <Text> tree's
 * nested <Text> children into one attributed string before layout (see
 * getFragments/getAttributedString in @react-pdf/layout), and its line-
 * breaking engine treats an embedded "\n" as a forced break point (see
 * @react-pdf/textkit's linebreaker, which searches the string for '\n').
 * No special-casing is needed — the run just needs to reach that string.
 */
function Runs({ block }: { block: ContractBlock }) {
  return (
    <>
      {block.runs.map((run, i) => (
        <Text
          key={i}
          style={{
            fontFamily: run.bold ? "Times-Bold" : "Times-Roman",
            fontStyle: run.italic ? "italic" : "normal",
            textDecoration: run.underline ? "underline" : "none",
          }}
        >
          {run.text}
        </Text>
      ))}
    </>
  );
}

interface CosContractPdfProps {
  body: TiptapNode;
  mergeContext: MergeContext;
  employeeName: string;
}

export function CosContractPdf({
  body,
  mergeContext,
  employeeName,
}: CosContractPdfProps) {
  const blocks = contractDocToBlocks(body, mergeContext);
  const { signatory_name, signatory_position, witness_name, witness_position } =
    mergeContext.contract;

  return (
    <Document title={`Contract of Service — ${employeeName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>CONTRACT OF SERVICE</Text>

        {blocks.map((block, i) =>
          block.kind === "paragraph" ? (
            <Text key={i} style={styles.paragraph}>
              <Runs block={block} />
            </Text>
          ) : (
            <View key={i} style={styles.listRow}>
              <Text style={styles.listMarker}>{block.marker ?? ""}</Text>
              <Text style={styles.listBody}>
                <Runs block={block} />
              </Text>
            </View>
          ),
        )}

        <View style={styles.signatureSection}>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>{employeeName}</Text>
            <Text style={styles.signatureRole}>Service Provider</Text>
          </View>
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLine}>{signatory_name ?? ""}</Text>
            <Text style={styles.signatureRole}>{signatory_position ?? ""}</Text>
          </View>
        </View>

        {witness_name ? (
          <View style={styles.signatureSection}>
            <View style={styles.signatureBlock}>
              <Text style={styles.signatureLine}>{witness_name}</Text>
              <Text style={styles.signatureRole}>
                {witness_position ?? "Witness"}
              </Text>
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
