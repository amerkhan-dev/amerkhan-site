/**
 * A 3×3×3 twisty-puzzle model and a CSS 3D renderer for the hobbies section.
 *
 * Coordinates follow CSS: x points right, y points down and z points toward
 * the viewer, so the U face sits at y = -1 and F at z = +1. Each cubie keeps
 * an integer position and an integer rotation matrix; a face turn rotates one
 * layer by ±90° about its axis, exactly like CSS rotateX/Y/Z.
 */
export type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Move = { face: Face; turns: 1 | 2 | 3 };
type Vec = [number, number, number];
type Mat = number[]; // row-major 3 × 3

export const FACES: readonly Face[] = ['U', 'D', 'L', 'R', 'F', 'B'];
// For every face: the axis (0 = x, 1 = y, 2 = z) and which layer it turns.
// A clockwise quarter turn, seen from outside that face, is layer × 90°.
const LAYERS: Record<Face, { axis: 0 | 1 | 2; layer: 1 | -1 }> = {
  U: { axis: 1, layer: -1 }, D: { axis: 1, layer: 1 },
  L: { axis: 0, layer: -1 }, R: { axis: 0, layer: 1 },
  F: { axis: 2, layer: 1 }, B: { axis: 2, layer: -1 },
};
const IDENTITY: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function rotation(axis: number, quarters: number): Mat {
  const turns = ((quarters % 4) + 4) % 4;
  const c = [1, 0, -1, 0][turns];
  const s = [0, 1, 0, -1][turns];
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

const times = (m: Mat, v: Vec): Vec => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
function compose(a: Mat, b: Mat): Mat {
  const out: Mat = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      out.push(a[row * 3] * b[col] + a[row * 3 + 1] * b[3 + col] + a[row * 3 + 2] * b[6 + col]);
    }
  }
  return out;
}

export type Cubie = { home: Vec; position: Vec; orientation: Mat };

export function createCube(): Cubie[] {
  const cubies: Cubie[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x || y || z) cubies.push({ home: [x, y, z], position: [x, y, z], orientation: IDENTITY });
      }
    }
  }
  return cubies;
}

/** Signed quarter turns for animation: R = +1, R2 = +2, R' = -1 (times the layer sign). */
export const quartersOf = (move: Move) => (move.turns === 3 ? -1 : move.turns) * LAYERS[move.face].layer;
export const axisOf = (face: Face) => LAYERS[face].axis;
export const inLayer = (cubie: Cubie, face: Face) =>
  cubie.position[LAYERS[face].axis] === LAYERS[face].layer;

export function applyMove(cubies: Cubie[], move: Move): void {
  const turn = rotation(LAYERS[move.face].axis, quartersOf(move));
  for (const cubie of cubies) {
    if (!inLayer(cubie, move.face)) continue;
    cubie.position = times(turn, cubie.position);
    cubie.orientation = compose(turn, cubie.orientation);
  }
}

/** Solved means every piece is home and upright. A center's spin is invisible, so it is ignored. */
export const isSolved = (cubies: Cubie[]) => cubies.every((cubie) =>
  cubie.position.every((value, index) => value === cubie.home[index])
  && (cubie.home.filter(Boolean).length === 1
    || cubie.orientation.every((value, index) => value === IDENTITY[index])));

export const notation = (move: Move) => move.face + (move.turns === 1 ? '' : move.turns === 2 ? '2' : "'");
export const invert = (moves: readonly Move[]): Move[] =>
  [...moves].reverse().map((move) => ({ face: move.face, turns: (4 - move.turns) as Move['turns'] }));

export function parseMoves(text: string): Move[] {
  return text.trim().split(/\s+/).filter(Boolean).map((token) => {
    const match = /^([UDLRFB])(2|')?$/.exec(token);
    if (!match) throw new Error(`Unknown move ${token}`);
    return { face: match[1] as Face, turns: match[2] === '2' ? 2 : match[2] === "'" ? 3 : 1 };
  });
}

/** Appends a move, merging it with a trailing turn of the same face. */
export function pushSimplified(history: Move[], move: Move): void {
  const last = history[history.length - 1];
  if (!last || last.face !== move.face) {
    history.push({ ...move });
    return;
  }
  const turns = (last.turns + move.turns) % 4;
  if (turns === 0) history.pop();
  else last.turns = turns as Move['turns'];
}

/** A random-move scramble that never repeats a face or wastes moves like R L R. */
export function scramble(length: number, random: () => number = Math.random): Move[] {
  const moves: Move[] = [];
  while (moves.length < length) {
    const face = FACES[Math.floor(random() * FACES.length)];
    const previous = moves[moves.length - 1];
    const beforeThat = moves[moves.length - 2];
    if (previous?.face === face) continue;
    if (previous && beforeThat && axisOf(previous.face) === axisOf(face)
      && axisOf(beforeThat.face) === axisOf(face)) continue;
    moves.push({ face, turns: (1 + Math.floor(random() * 3)) as Move['turns'] });
  }
  return moves;
}

/* ------------------------------------------------------------------ */
/* Renderer                                                             */
/* ------------------------------------------------------------------ */

// Sticker colors come from each cubie's home position; faces pointing into
// the puzzle stay dark plastic.
const FACE_SIDES: { name: string; normal: Vec; transform: string }[] = [
  { name: 'R', normal: [1, 0, 0], transform: 'rotateY(90deg)' },
  { name: 'L', normal: [-1, 0, 0], transform: 'rotateY(-90deg)' },
  { name: 'U', normal: [0, -1, 0], transform: 'rotateX(90deg)' },
  { name: 'D', normal: [0, 1, 0], transform: 'rotateX(-90deg)' },
  { name: 'F', normal: [0, 0, 1], transform: '' },
  { name: 'B', normal: [0, 0, -1], transform: 'rotateY(180deg)' },
];
const AXIS_FUNCTIONS = ['rotateX', 'rotateY', 'rotateZ'];

export type CubeView = {
  element: HTMLElement;
  cubies: Cubie[];
  /** Adds moves to the animation queue (or applies them at once without motion). */
  play(moves: Move[], options?: { duration?: number; animate?: boolean }): void;
  /** Drops queued, unstarted moves. */
  clearQueue(): void;
  /** Moves that are queued or still animating. */
  pending(): Move[];
  history: Move[];
  setView(rx: number, ry: number): void;
  view(): { rx: number; ry: number };
};

export function mountCube(host: HTMLElement, options: {
  size: number;
  onChange?: (event: { type: 'move' | 'idle'; move?: Move }) => void;
}): CubeView {
  const spacing = options.size / 3;
  const cube = document.createElement('div');
  cube.className = 'cube';
  const cubies = createCube();
  const elements = new Map<Cubie, HTMLElement>();
  const history: Move[] = [];
  let rx = -26;
  let ry = -38;

  for (const cubie of cubies) {
    const element = document.createElement('div');
    element.className = 'cubie';
    for (const side of FACE_SIDES) {
      const face = document.createElement('span');
      const outward = side.normal.every((value, index) => !value || value === cubie.home[index]);
      face.className = outward ? `cubie-face sticker-${side.name}` : 'cubie-face';
      face.style.transform = `${side.transform} translateZ(${spacing / 2}px)`;
      element.append(face);
    }
    elements.set(cubie, element);
    cube.append(element);
  }
  host.append(cube);

  const base = (cubie: Cubie) => {
    const o = cubie.orientation;
    const [x, y, z] = cubie.position.map((value) => value * spacing);
    return `matrix3d(${o[0]},${o[3]},${o[6]},0,${o[1]},${o[4]},${o[7]},0,${o[2]},${o[5]},${o[8]},0,${x},${y},${z},1)`;
  };
  const render = (cubie: Cubie, prefix = '') => {
    elements.get(cubie)!.style.transform = prefix + base(cubie);
  };
  const setView = (x: number, y: number) => {
    rx = Math.max(-85, Math.min(85, x));
    ry = y;
    cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  };
  cubies.forEach((cubie) => render(cubie));
  setView(rx, ry);

  type Turn = { move: Move; moving: Cubie[]; started: number; duration: number };
  const queue: { move: Move; duration: number }[] = [];
  let current: Turn | null = null;
  let frame = 0;

  const commit = (move: Move) => {
    const moving = cubies.filter((cubie) => inLayer(cubie, move.face));
    applyMove(cubies, move);
    moving.forEach((cubie) => render(cubie));
    pushSimplified(history, move);
    options.onChange?.({ type: 'move', move });
  };
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const start = (now: number) => {
    const next = queue.shift();
    current = next ? {
      move: next.move, duration: next.duration, started: now,
      moving: cubies.filter((cubie) => inLayer(cubie, next.move.face)),
    } : null;
  };
  const tick = (now: number) => {
    frame = 0;
    if (!current) start(now);
    // A finished turn hands the rest of its frame to the next one, so a slow
    // frame never adds an idle gap between moves.
    while (current && now - current.started >= current.duration) {
      const { move, started, duration } = current;
      commit(move);
      start(started + duration);
    }
    if (current) {
      const progress = Math.max(0, (now - current.started) / current.duration);
      const angle = quartersOf(current.move) * 90 * ease(progress);
      const prefix = `${AXIS_FUNCTIONS[axisOf(current.move.face)]}(${angle}deg) `;
      current.moving.forEach((cubie) => render(cubie, prefix));
      frame = window.requestAnimationFrame(tick);
    } else options.onChange?.({ type: 'idle' });
  };

  return {
    element: cube,
    cubies,
    history,
    play(moves, { duration = 150, animate = true } = {}) {
      if (!animate || typeof window.requestAnimationFrame !== 'function') {
        // Finish anything in flight, then apply the new moves immediately.
        if (frame) window.cancelAnimationFrame(frame);
        frame = 0;
        const flush = [...(current ? [current.move] : []), ...queue.map((item) => item.move), ...moves];
        current = null;
        queue.length = 0;
        flush.forEach(commit);
        options.onChange?.({ type: 'idle' });
        return;
      }
      moves.forEach((move) => queue.push({ move, duration }));
      if (!frame && moves.length) frame = window.requestAnimationFrame(tick);
    },
    clearQueue() {
      queue.length = 0;
    },
    pending: () => [...(current ? [current.move] : []), ...queue.map((item) => item.move)],
    setView,
    view: () => ({ rx, ry }),
  };
}
