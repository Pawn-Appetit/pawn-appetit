export function getChessTitle(rating: number): string {
  if (rating >= 2500) return "Grandmaster";
  if (rating >= 2200) return "International Master";
  if (rating >= 2000) return "Expert";
  if (rating >= 1800) return "Class A";
  if (rating >= 1600) return "Class B";
  if (rating >= 1400) return "Class C";
  if (rating >= 1200) return "Class D";
  if (rating >= 1000) return "Class E";
  if (rating >= 800) return "Class F";
  if (rating >= 600) return "Class G";
  if (rating >= 400) return "Class H";
  if (rating >= 200) return "Class I";
  if (rating >= 100) return "Class J";
  return "Class K";
}
