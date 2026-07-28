// Amount in words for printed contracts — standard on PH government paperwork.
//
// Ported from adm-v26/lib/pdf/generatePRUnspsc.ts:8-92, where the same function
// is duplicated in generateGuaranteeLetter.ts. Ported once here; the
// duplication is not carried over.
//
// No DOM, no dependencies: supabase/tests/cos-contract-unit.test.mts imports
// this directly under `node --experimental-strip-types`.

const ONES = [
  "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];

const TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty",
  "ninety",
];

function numberToWords(num: number): string {
  if (num === 0) return "zero";
  if (num < 20) return ONES[num];
  if (num < 100) {
    const ten = Math.floor(num / 10);
    const one = num % 10;
    return TENS[ten] + (one > 0 ? " " + ONES[one] : "");
  }
  if (num < 1000) {
    const hundred = Math.floor(num / 100);
    const remainder = num % 100;
    return (
      ONES[hundred] +
      " hundred" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  if (num < 1_000_000) {
    const thousand = Math.floor(num / 1000);
    const remainder = num % 1000;
    return (
      numberToWords(thousand) +
      " thousand" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  if (num < 1_000_000_000) {
    const million = Math.floor(num / 1_000_000);
    const remainder = num % 1_000_000;
    return (
      numberToWords(million) +
      " million" +
      (remainder > 0 ? " " + numberToWords(remainder) : "")
    );
  }
  // The original returns "" past 999,999,999. A COS monthly rate can never
  // reach this, and inventing a format silently would be worse than a blank.
  return "";
}

/** "TWENTY FOUR THOUSAND & 50/100" — uppercase, centavos as a fraction. */
export function formatAmountInWords(amount: number): string {
  const wholePart = Math.floor(amount);
  const decimalPart = Math.round((amount - wholePart) * 100);

  let words = numberToWords(wholePart).toUpperCase();
  if (decimalPart > 0) {
    words += ` & ${decimalPart}/100`;
  }
  return words;
}
