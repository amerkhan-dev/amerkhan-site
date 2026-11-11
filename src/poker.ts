// Texas hold'em hand evaluation and Monte Carlo equity. Pure functions, no DOM.
//
// A card is an integer 0..51: rank = card >> 2 (0 is a two, 12 is an ace),
// suit = card & 3. Hand scores are plain numbers; a higher score wins.

export type Tally = { boards: number; wins: number; ties: number; losses: number };

const RANKS = "23456789TJQKA";
const SUITS = "shdc";

/** "As Kd" -> [51 - ..., ...]. Throws on anything that is not a real card. */
export function parseCards(text: string): number[] {
  return text.trim().split(/\s+/).map((token) => {
    const rank = RANKS.indexOf(token[0]?.toUpperCase() ?? "");
    const suit = SUITS.indexOf(token[1]?.toLowerCase() ?? "");
    if (token.length !== 2 || rank < 0 || suit < 0) throw new Error(`Not a card: ${token}`);
    return rank * 4 + suit;
  });
}

const counts = new Uint8Array(13);

/**
 * Score five cards. The category sits above five base-13 kicker slots:
 * 8 straight flush, 7 four of a kind, 6 full house, 5 flush, 4 straight,
 * 3 three of a kind, 2 two pair, 1 pair, 0 high card.
 */
export function rank5(c0: number, c1: number, c2: number, c3: number, c4: number): number {
  counts.fill(0);
  counts[c0 >> 2]++;
  counts[c1 >> 2]++;
  counts[c2 >> 2]++;
  counts[c3 >> 2]++;
  counts[c4 >> 2]++;
  const suit = c0 & 3;
  const flush = (c1 & 3) === suit && (c2 & 3) === suit && (c3 & 3) === suit && (c4 & 3) === suit;

  // Walk ranks from the ace down, sorting them into groups by how often they appear.
  let four = -1;
  let three = -1;
  let pairHigh = -1;
  let pairLow = -1;
  let singles = 0; // base-13 digits, highest first
  let singleCount = 0;
  let top = -1;
  let bottom = -1;
  for (let rank = 12; rank >= 0; rank--) {
    const n = counts[rank];
    if (n === 0) continue;
    if (top < 0) top = rank;
    bottom = rank;
    if (n === 4) four = rank;
    else if (n === 3) three = rank;
    else if (n === 2) {
      if (pairHigh < 0) pairHigh = rank;
      else pairLow = rank;
    } else {
      singles = singles * 13 + rank;
      singleCount++;
    }
  }

  const CATEGORY = 371293; // 13 ** 5
  if (singleCount === 5) {
    // Five distinct ranks: a straight is five in a row, or the wheel A-2-3-4-5.
    const wheel = top === 12 && counts[3] === 1 && counts[2] === 1 && counts[1] === 1 && counts[0] === 1;
    const straight = top - bottom === 4 || wheel;
    const high = wheel ? 3 : top;
    if (straight) return (flush ? 8 : 4) * CATEGORY + high;
    return (flush ? 5 : 0) * CATEGORY + singles;
  }
  if (four >= 0) return 7 * CATEGORY + four * 13 + singles;
  if (three >= 0 && pairHigh >= 0) return 6 * CATEGORY + three * 13 + pairHigh;
  if (three >= 0) return 3 * CATEGORY + three * 169 + singles;
  if (pairLow >= 0) return 2 * CATEGORY + pairHigh * 169 + pairLow * 13 + singles;
  return CATEGORY + pairHigh * 2197 + singles;
}

// The 21 ways to leave two of seven cards out.
const SEVEN_CHOOSE_FIVE: number[][] = [];
for (let a = 0; a < 7; a++) {
  for (let b = a + 1; b < 7; b++) {
    SEVEN_CHOOSE_FIVE.push([0, 1, 2, 3, 4, 5, 6].filter((index) => index !== a && index !== b));
  }
}

/** Best five-card score among seven cards (two hole cards plus the board). */
export function rank7(cards: ArrayLike<number>): number {
  let best = -1;
  for (const pick of SEVEN_CHOOSE_FIVE) {
    const score = rank5(cards[pick[0]], cards[pick[1]], cards[pick[2]], cards[pick[3]], cards[pick[4]]);
    if (score > best) best = score;
  }
  return best;
}

const heroSeven = new Uint8Array(7);
const villainSeven = new Uint8Array(7);

/** Compare two hold'em hands on one five-card board: 1 hero wins, 0 tie, -1 hero loses. */
export function showdown(hero: ArrayLike<number>, villain: ArrayLike<number>, board: ArrayLike<number>): number {
  heroSeven[0] = hero[0];
  heroSeven[1] = hero[1];
  villainSeven[0] = villain[0];
  villainSeven[1] = villain[1];
  for (let i = 0; i < 5; i++) {
    heroSeven[i + 2] = board[i];
    villainSeven[i + 2] = board[i];
  }
  const a = rank7(heroSeven);
  const b = rank7(villainSeven);
  return a > b ? 1 : a < b ? -1 : 0;
}

/**
 * Deal `boards` random five-card boards and add the results to `tally`.
 * `random` returns a float in [0, 1); pass a seeded generator for repeatable runs.
 */
export function simulate(
  hero: ArrayLike<number>,
  villain: ArrayLike<number>,
  boards: number,
  random: () => number = Math.random,
  tally: Tally = { boards: 0, wins: 0, ties: 0, losses: 0 },
): Tally {
  const dead = new Set<number>([hero[0], hero[1], villain[0], villain[1]]);
  if (dead.size !== 4) throw new Error("The two hands share a card");
  const deck: number[] = [];
  for (let card = 0; card < 52; card++) if (!dead.has(card)) deck.push(card);

  for (let n = 0; n < boards; n++) {
    // Partial Fisher-Yates: the first five slots become this board.
    for (let i = 0; i < 5; i++) {
      const j = i + Math.floor(random() * (deck.length - i));
      const swap = deck[i];
      deck[i] = deck[j];
      deck[j] = swap;
    }
    const result = showdown(hero, villain, deck);
    if (result > 0) tally.wins++;
    else if (result < 0) tally.losses++;
    else tally.ties++;
    tally.boards++;
  }
  return tally;
}

/** Standard error of the hero's win share, in the same 0..1 units. */
export function standardError(tally: Tally): number {
  if (tally.boards === 0) return 0;
  const p = tally.wins / tally.boards;
  return Math.sqrt((p * (1 - p)) / tally.boards);
}
