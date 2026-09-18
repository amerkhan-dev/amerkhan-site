/**
 * A small Texas Hold'em engine for the hobbies section: a 7-card hand
 * evaluator and a Monte Carlo equity estimate against one random hand.
 *
 * Cards are integers 0–51: rank = card >> 2 (0 = deuce … 12 = ace),
 * suit = card & 3 (spades, hearts, diamonds, clubs).
 */
export const RANK_SYMBOLS = '23456789TJQKA';
export const SUIT_SYMBOLS = ['♠', '♥', '♦', '♣'] as const;
const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const RANK_NAMES = ['Deuce', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_PLURALS = ['Deuces', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
export const HAND_CATEGORIES = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush',
  'Full house', 'Four of a kind', 'Straight flush'] as const;

const rankCount = new Uint8Array(13);
const suitCount = new Uint8Array(4);
const suitMask = new Uint16Array(4);
const WHEEL = 0b1000000001111;

function straightHigh(mask: number): number {
  for (let high = 12; high >= 4; high--) {
    const run = 0b11111 << (high - 4);
    if ((mask & run) === run) return high;
  }
  return (mask & WHEEL) === WHEEL ? 3 : -1;
}

/** Packs the highest `count` ranks of `mask` into 4-bit fields, starting at `shift`. */
function kickers(mask: number, count: number, shift: number): number {
  let packed = 0;
  for (let rank = 12; rank >= 0 && count > 0; rank--) {
    if (mask & (1 << rank)) {
      packed |= rank << shift;
      shift -= 4;
      count--;
    }
  }
  return packed;
}

/**
 * Scores the best five-card hand among five to seven cards. A higher score is
 * a stronger hand; equal scores tie. The category sits in bits 20 and up.
 */
export function evaluate(cards: ArrayLike<number>, length = cards.length): number {
  rankCount.fill(0);
  suitCount.fill(0);
  suitMask.fill(0);
  let ranks = 0;
  for (let i = 0; i < length; i++) {
    const rank = cards[i] >> 2;
    const suit = cards[i] & 3;
    rankCount[rank]++;
    suitCount[suit]++;
    suitMask[suit] |= 1 << rank;
    ranks |= 1 << rank;
  }

  // Seven cards cannot hold a flush together with quads or a full house,
  // so a flush settles the category (unless it is also a straight).
  for (let suit = 0; suit < 4; suit++) {
    if (suitCount[suit] < 5) continue;
    const high = straightHigh(suitMask[suit]);
    return high >= 0 ? (8 << 20) | (high << 16) : (5 << 20) | kickers(suitMask[suit], 5, 16);
  }

  let quad = -1;
  let trips = -1;
  let pairHigh = -1;
  let pairLow = -1;
  for (let rank = 12; rank >= 0; rank--) {
    const count = rankCount[rank];
    if (count === 4) quad = rank;
    else if (count === 3 && trips < 0) trips = rank;
    else if (count >= 2) {
      // A second, lower set of trips plays as the pair of a full house.
      if (pairHigh < 0) pairHigh = rank;
      else if (pairLow < 0) pairLow = rank;
    }
  }

  if (quad >= 0) return (7 << 20) | (quad << 16) | kickers(ranks & ~(1 << quad), 1, 12);
  if (trips >= 0 && pairHigh >= 0) return (6 << 20) | (trips << 16) | (pairHigh << 12);
  const straight = straightHigh(ranks);
  if (straight >= 0) return (4 << 20) | (straight << 16);
  if (trips >= 0) return (3 << 20) | (trips << 16) | kickers(ranks & ~(1 << trips), 2, 12);
  if (pairLow >= 0) {
    return (2 << 20) | (pairHigh << 16) | (pairLow << 12)
      | kickers(ranks & ~(1 << pairHigh) & ~(1 << pairLow), 1, 8);
  }
  if (pairHigh >= 0) return (1 << 20) | (pairHigh << 16) | kickers(ranks & ~(1 << pairHigh), 3, 12);
  return kickers(ranks, 5, 16);
}

export const categoryOf = (score: number) => HAND_CATEGORIES[score >> 20];

export type Tally = { wins: number; ties: number; trials: number };

/**
 * Plays `trials` random boards of heads-up hold'em between `hole` and one
 * random opponent hand, adding the results to `tally`.
 */
export function simulate(hole: readonly [number, number], trials: number,
  tally: Tally = { wins: 0, ties: 0, trials: 0 }, random: () => number = Math.random): Tally {
  const deck: number[] = [];
  for (let card = 0; card < 52; card++) if (card !== hole[0] && card !== hole[1]) deck.push(card);
  const hero = new Uint8Array(7);
  const villain = new Uint8Array(7);
  hero[0] = hole[0];
  hero[1] = hole[1];
  for (let trial = 0; trial < trials; trial++) {
    // Partial Fisher–Yates: the first seven slots become a uniform random draw.
    for (let i = 0; i < 7; i++) {
      const j = i + Math.floor(random() * (deck.length - i));
      const card = deck[i];
      deck[i] = deck[j];
      deck[j] = card;
    }
    for (let i = 0; i < 5; i++) {
      hero[i + 2] = deck[i];
      villain[i + 2] = deck[i];
    }
    villain[0] = deck[5];
    villain[1] = deck[6];
    const ours = evaluate(hero, 7);
    const theirs = evaluate(villain, 7);
    if (ours > theirs) tally.wins++;
    else if (ours === theirs) tally.ties++;
  }
  tally.trials += trials;
  return tally;
}

/** Equity counts a tie as half a win, as pot-splitting does. */
export const equityOf = (tally: Tally) => (tally.trials ? (tally.wins + tally.ties / 2) / tally.trials : 0);

export function dealHole(random: () => number = Math.random): [number, number] {
  const first = Math.floor(random() * 52);
  let second = Math.floor(random() * 51);
  if (second >= first) second++;
  return [first, second];
}

export const cardRank = (card: number) => RANK_SYMBOLS[card >> 2];
export const cardSuit = (card: number) => SUIT_SYMBOLS[card & 3];
export const isRed = (card: number) => (card & 3) === 1 || (card & 3) === 2;
export const cardName = (card: number) => `${RANK_NAMES[card >> 2].replace('Deuce', 'Two')} of ${SUIT_NAMES[card & 3]}`;

const NICKNAMES: Record<string, string> = {
  AA: 'Pocket Rockets 🚀', KK: 'Cowboys 🤠', QQ: 'Ladies 👑', JJ: 'Fishhooks 🪝', TT: 'Dimes 🪙',
  '88': 'Snowmen ⛄', '77': 'Hockey Sticks 🏒', '66': 'Route 66 🛣️', '55': 'Speed Limit 🚦',
  '44': 'Sailboats ⛵', '33': 'Crabs 🦀', '22': 'Ducks 🦆', AK: 'Big Slick 🎰', KQ: 'Marriage 💍',
};

/** Describes two hole cards: "AKs", "Ace-King suited", and a table nickname when one exists. */
export function describeHole(hole: readonly [number, number]) {
  const [high, low] = (hole[0] >> 2) >= (hole[1] >> 2) ? hole : [hole[1], hole[0]];
  const highRank = high >> 2;
  const lowRank = low >> 2;
  const pair = highRank === lowRank;
  const suited = !pair && (high & 3) === (low & 3);
  const ranks = RANK_SYMBOLS[highRank] + RANK_SYMBOLS[lowRank];
  const short = pair ? ranks : ranks + (suited ? 's' : 'o');
  const long = pair ? `Pocket ${RANK_PLURALS[highRank]}`
    : `${RANK_NAMES[highRank]}-${RANK_NAMES[lowRank]} ${suited ? 'suited' : 'offsuit'}`;
  let nickname: string | undefined = NICKNAMES[ranks];
  if (short === '72o') nickname = "Poker's most infamous hand 🗑️";
  else if (!nickname && suited && highRank - lowRank === 1) nickname = 'Suited connectors ✨';
  return { short, long, nickname };
}

/** A light-hearted read on equity against one random hand. */
export function verdict(equity: number) {
  if (equity >= 0.7) return '🔥 Monster';
  if (equity >= 0.6) return '💪 Strong';
  if (equity >= 0.5) return '🙂 Playable';
  if (equity >= 0.4) return '🤔 Speculative';
  return '🗑️ Muck it';
}
