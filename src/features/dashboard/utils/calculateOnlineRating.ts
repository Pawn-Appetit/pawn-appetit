/**
 * Calculates the average online rating based on time controls with more than 10 games
 * @param mainSession - The main session (Lichess or Chess.com)
 * @returns The average rating, or 0 if no valid ratings found
 */
export function calculateOnlineRating(mainSession: any): number {
  const MIN_GAMES = 10;
  const ratings: number[] = [];

  if (mainSession?.lichess?.account) {
    const acc = mainSession.lichess.account;
    const perfs = acc.perfs;

    // Check bullet
    if (perfs?.bullet && perfs.bullet.games >= MIN_GAMES) {
      ratings.push(perfs.bullet.rating);
    }

    // Check blitz
    if (perfs?.blitz && perfs.blitz.games >= MIN_GAMES) {
      ratings.push(perfs.blitz.rating);
    }

    // Check rapid
    if (perfs?.rapid && perfs.rapid.games >= MIN_GAMES) {
      ratings.push(perfs.rapid.rating);
    }

    // Check classical
    if (perfs?.classical && perfs.classical.games >= MIN_GAMES) {
      ratings.push(perfs.classical.rating);
    }
  } else if (mainSession?.chessCom?.stats) {
    const stats = mainSession.chessCom.stats;

    // Check bullet
    if (stats.chess_bullet?.record && stats.chess_bullet.last?.rating) {
      const totalGames =
        (stats.chess_bullet.record.win || 0) +
        (stats.chess_bullet.record.loss || 0) +
        (stats.chess_bullet.record.draw || 0);
      if (totalGames >= MIN_GAMES) {
        ratings.push(stats.chess_bullet.last.rating);
      }
    }

    // Check blitz
    if (stats.chess_blitz?.record && stats.chess_blitz.last?.rating) {
      const totalGames =
        (stats.chess_blitz.record.win || 0) +
        (stats.chess_blitz.record.loss || 0) +
        (stats.chess_blitz.record.draw || 0);
      if (totalGames >= MIN_GAMES) {
        ratings.push(stats.chess_blitz.last.rating);
      }
    }

    // Check rapid
    if (stats.chess_rapid?.record && stats.chess_rapid.last?.rating) {
      const totalGames =
        (stats.chess_rapid.record.win || 0) +
        (stats.chess_rapid.record.loss || 0) +
        (stats.chess_rapid.record.draw || 0);
      if (totalGames >= MIN_GAMES) {
        ratings.push(stats.chess_rapid.last.rating);
      }
    }
  }

  // Calculate average if we have any valid ratings
  if (ratings.length === 0) {
    return 0;
  }

  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  return Math.round(sum / ratings.length);
}
