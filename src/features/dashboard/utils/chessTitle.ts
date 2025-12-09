export function getChessTitle(rating: number): string {
  if (rating >= 2100) return "Strong Master";
  if (rating >= 2000) return "Club Master";
  if (rating >= 1900) return "Strong Expert";
  if (rating >= 1800) return "Expert";
  if (rating >= 1700) return "Club Expert";
  if (rating >= 1600) return "Strong Advanced Player";
  if (rating >= 1500) return "Advanced Player";
  if (rating >= 1400) return "Skilled Competitor";
  if (rating >= 1300) return "Competitive Club Player";
  if (rating >= 1200) return "Strong Club Player";
  if (rating >= 1100) return "Club Player";
  if (rating >= 1000) return "Entry-Level Club Player";
  if (rating >= 900) return "Strong Amateur";
  if (rating >= 800) return "Amateur";
  if (rating >= 700) return "Early Amateur";
  if (rating >= 600) return "Advanced Novice";
  if (rating >= 500) return "Novice";
  if (rating >= 400) return "Solid Beginner";
  if (rating >= 300) return "Beginner";
  if (rating >= 200) return "Early Learner";
  if (rating >= 100) return "Brand New";
  return "Brand New";
}
