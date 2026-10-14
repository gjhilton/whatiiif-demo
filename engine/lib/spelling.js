// For telling someone which word they probably meant when they typed one we do not know.

/** How many letters must be added, removed, changed or swapped round to turn `a` into `b`. */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** The one of `words` that `typed` is a slip away from, ignoring case, if there is one. */
export function closest(typed, words) {
  const lower = typed.toLowerCase();
  const near = words
    .map((word) => ({ word, apart: distance(lower, word.toLowerCase()) }))
    .filter(({ word, apart }) => apart <= Math.min(2, Math.floor(word.length / 3)))
    .sort((a, b) => a.apart - b.apart);
  return near[0]?.word;
}
