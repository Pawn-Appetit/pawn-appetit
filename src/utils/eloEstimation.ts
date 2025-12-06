/**
 * Calculate estimated Elo based on Average Centipawn Loss (ACPL)
 * 
 * Formula: E = 3100·e^(−0.01·L)
 * Where:
 * - L = Average Centipawn Loss (ACPL)
 * - E = Estimated Elo
 * - e = Euler's number (≈ 2.718281828)
 * 
 * @param acpl Average Centipawn Loss
 * @returns Estimated Elo rating
 */
export function calculateEstimatedElo(acpl: number): number {
  if (acpl <= 0 || !isFinite(acpl)) {
    return 0;
  }
  
  // E = 3100·e^(−0.01·L)
  const estimatedElo = 3100 * Math.exp(-0.01 * acpl);
  
  // Round to nearest integer
  return Math.round(estimatedElo);
}

/**
 * Calculate estimated Accuracy based on Average Centipawn Loss (ACPL)
 * 
 * Formula: A = 103.3979 − 0.3820659·L − 0.002169231·L²
 * Where:
 * - L = Average Centipawn Loss (ACPL)
 * - A = Accuracy (percentage, approximately 0-100)
 * 
 * @param acpl Average Centipawn Loss
 * @returns Estimated Accuracy percentage
 */
export function calculateEstimatedAccuracy(acpl: number): number {
  if (acpl <= 0 || !isFinite(acpl)) {
    return 0;
  }
  
  // A = 103.3979 − 0.3820659·L − 0.002169231·L²
  const accuracy = 103.3979 - 0.3820659 * acpl - 0.002169231 * acpl * acpl;
  
  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, accuracy));
}

