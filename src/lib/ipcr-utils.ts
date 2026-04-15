// IPCR rating utilities — shared between server and client

export function getAdjectivalRating(numerical: number | null): string | null {
  if (numerical === null || numerical === undefined) return null;
  if (numerical >= 4.5) return "Outstanding";
  if (numerical >= 3.5) return "Very Satisfactory";
  if (numerical >= 2.5) return "Satisfactory";
  if (numerical >= 1.5) return "Unsatisfactory";
  return "Poor";
}

export function getRatingColor(adjectival: string | null): string {
  switch (adjectival) {
    case "Outstanding":
      return "text-green-700 bg-green-100 border-green-200";
    case "Very Satisfactory":
      return "text-blue-700 bg-blue-100 border-blue-200";
    case "Satisfactory":
      return "text-yellow-700 bg-yellow-100 border-yellow-200";
    case "Unsatisfactory":
      return "text-orange-700 bg-orange-100 border-orange-200";
    case "Poor":
      return "text-red-700 bg-red-100 border-red-200";
    default:
      return "";
  }
}
