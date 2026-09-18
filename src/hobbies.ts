import { cardName, cardRank, cardSuit, dealHole, describeHole, equityOf, isRed, simulate, verdict, type Tally } from './poker';
import { createEquityChart, type EquityPoint } from './equity-chart';
import { FACES, invert, isSolved, mountCube, notation, scramble, type Face, type Move } from './cube';
import { burstFrom, cheer, emojiList, motionAllowed, setRichText } from './fx';

/*
 * The hobby cards are complete without JavaScript. Each widget below starts
 * hidden in the HTML and is revealed only after its controls are wired up.
 */
const pick = <T extends Element>(root: ParentNode, selector: string) => root.querySelector<T>(selector);
const raf = (callback: FrameRequestCallback) => window.requestAnimationFrame(callback);
const canAnimate = () => motionAllowed() && typeof window.requestAnimationFrame === 'function';
const formatCount = (value: number) => value.toLocaleString('en-US');

/* ------------------------------------------------------------------ */
/* Poker: deal two cards, then estimate equity with Monte Carlo runs.   */
/* ------------------------------------------------------------------ */
const POKER_TRIALS = 20000;
const POKER_STEP = 250;
const REVEAL_MS = 900;

/** Runs every simulation up front (a few milliseconds), keeping a snapshot per step. */
function convergence(hole: [number, number]): { points: EquityPoint[]; tally: Tally } {
  const tally: Tally = { wins: 0, ties: 0, trials: 0 };
  const points: EquityPoint[] = [];
  while (tally.trials < POKER_TRIALS) {
    simulate(hole, POKER_STEP, tally);
    // Each board scores 1 (win), ½ (tie) or 0, so the mean of squares is (W + T/4) / n.
    const mean = equityOf(tally);
    const variance = Math.max(0, (tally.wins + tally.ties / 4) / tally.trials - mean * mean);
    const margin = 1.96 * Math.sqrt(variance / tally.trials);
    points.push({ trials: tally.trials, equity: mean, low: Math.max(0, mean - margin), high: Math.min(1, mean + margin) });
  }
  return { points, tally };
}

function initPoker() {
  const root = pick<HTMLElement>(document, '[data-poker]');
  if (!root) return;
  const button = pick<HTMLButtonElement>(root, '[data-poker-deal]');
  const cards = [...root.querySelectorAll<HTMLElement>('.playing-card')];
  const equityText = pick<HTMLElement>(root, '[data-poker-equity]');
  const handText = pick<HTMLElement>(root, '[data-poker-hand]');
  const simsText = pick<HTMLElement>(root, '[data-poker-sims]');
  const meter = pick<HTMLElement>(root, '[data-poker-meter]');
  const plot = pick<HTMLElement>(root, '[data-poker-chart]');
  const live = pick<HTMLElement>(root, '[data-poker-live]');
  if (!button || cards.length !== 2 || !equityText || !handText || !simsText || !meter || !plot || !live) return;
  const card = root.closest<HTMLElement>('.hobby-card');
  const chart = createEquityChart(plot, {
    maxTrials: POKER_TRIALS,
    table: pick<HTMLTableSectionElement>(root, '[data-poker-table]'),
  });

  let frame = 0;
  let timers: number[] = [];
  const cancel = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
  };

  const showFaces = (hole: [number, number]) => cards.forEach((element, index) => {
    const value = hole[index];
    pick<HTMLElement>(element, '[data-card-rank]')!.textContent = cardRank(value) === 'T' ? '10' : cardRank(value);
    // U+FE0E asks for the text (not emoji) presentation of the suit.
    pick<HTMLElement>(element, '[data-card-suit]')!.textContent = `${cardSuit(value)}\uFE0E`;
    element.classList.toggle('is-red', isRed(value));
  });

  const showPoint = (point: EquityPoint) => {
    equityText.textContent = `${(point.equity * 100).toFixed(1)}%`;
    meter.style.width = `${(point.equity * 100).toFixed(2)}%`;
  };

  const finish = (hole: [number, number], points: EquityPoint[], tally: Tally) => {
    frame = 0;
    chart.show(points.length);
    const final = points[points.length - 1];
    showPoint(final);
    const info = describeHole(hole);
    root.dataset.state = 'done';
    setRichText(handText, `${info.short}${info.nickname ? ` · ${info.nickname}` : ''} · ${verdict(final.equity)}`);
    simsText.textContent = `${formatCount(tally.trials)} runs · win ${(tally.wins / tally.trials * 100).toFixed(1)}%`
      + ` · tie ${(tally.ties / tally.trials * 100).toFixed(1)}% · ±${((final.high - final.low) * 50).toFixed(1)}%`;
    live.textContent = `${cardName(hole[0])} and ${cardName(hole[1])}, ${info.long}: `
      + `${(final.equity * 100).toFixed(1)} percent equity against a random hand over ${formatCount(tally.trials)} simulations.`;
    if (info.short === 'AA') cheer('Pocket rockets! 🚀', '🚀');
    else if (final.equity >= 0.65) cheer('Premium hand! 🔥', '🔥');
    else if (final.equity < 0.4) cheer('Fold it… 🙈', '🙈');
    else cheer("Let's see a flop 🃏", '🃏');
    if (final.equity >= 0.65 && card) burstFrom(equityText, emojiList(card.dataset.burst));
  };

  // Replays the finished simulation's path so the estimate visibly settles.
  const reveal = (hole: [number, number], points: EquityPoint[], tally: Tally) => {
    let started = 0;
    const step = (now: number) => {
      started ||= now;
      const progress = Math.min(1, (now - started) / REVEAL_MS);
      if (progress >= 1) {
        finish(hole, points, tally);
        return;
      }
      const count = Math.max(1, Math.ceil(points.length * progress * progress));
      chart.show(count);
      showPoint(points[count - 1]);
      simsText.textContent = `Estimate after ${formatCount(points[count - 1].trials)} of ${formatCount(POKER_TRIALS)} boards…`;
      frame = raf(step);
    };
    frame = raf(step);
  };

  button.addEventListener('click', () => {
    cancel();
    const hole = dealHole();
    const { points, tally } = convergence(hole);
    chart.setData(points);
    root.dataset.state = 'dealing';
    handText.textContent = 'Shuffling up and dealing…';
    live.textContent = '';
    if (!canAnimate()) {
      showFaces(hole);
      cards.forEach((element) => element.classList.add('is-up'));
      finish(hole, points, tally);
      return;
    }
    const wasUp = cards.some((element) => element.classList.contains('is-up'));
    cards.forEach((element) => element.classList.remove('is-up'));
    equityText.textContent = '…';
    meter.style.width = '0%';
    // Let face-up cards finish turning over before their faces change.
    const flip = wasUp ? 320 : 0;
    timers.push(window.setTimeout(() => {
      showFaces(hole);
      cards[0].classList.add('is-up');
    }, flip));
    timers.push(window.setTimeout(() => {
      cards[1].classList.add('is-up');
      reveal(hole, points, tally);
    }, flip + 140));
  });

  root.hidden = false;
  chart.refresh();
}

/* ------------------------------------------------------------------ */
/* Barbell: load plates toward 2× bodyweight, then the 340+ target.     */
/* ------------------------------------------------------------------ */
const PLATE_ORDER = [45, 45, 45, 5, 2.5, 5];
const PLATE_SIZES: Record<string, { width: number; height: number }> = {
  45: { width: 10, height: 96 }, 5: { width: 6, height: 44 }, 2.5: { width: 5, height: 32 },
};
const SVG = 'http://www.w3.org/2000/svg';

function initBarbell() {
  const root = pick<HTMLElement>(document, '[data-barbell]');
  if (!root) return;
  const add = pick<HTMLButtonElement>(root, '[data-barbell-add]');
  const reset = pick<HTMLButtonElement>(root, '[data-barbell-reset]');
  const totalText = pick<HTMLElement>(root, '[data-barbell-total]');
  const note = pick<HTMLElement>(root, '[data-barbell-note]');
  const live = pick<HTMLElement>(root, '[data-barbell-live]');
  const left = pick<SVGGElement>(root, '[data-plates="left"]');
  const right = pick<SVGGElement>(root, '[data-plates="right"]');
  if (!add || !reset || !totalText || !note || !live || !left || !right) return;
  const bodyweight = Number(root.dataset.bodyweight) || 165;
  const goal = 2 * bodyweight;

  let loaded = 0;
  let shown = 45;
  let frame = 0;
  const totalFor = (count: number) => 45 + 2 * PLATE_ORDER.slice(0, count).reduce((sum, plate) => sum + plate, 0);
  const noteFor = (total: number) => {
    if (total === 45) return "Just the bar. Let's load it. 🏋️";
    if (total === 135) return 'One plate a side. Warm-up weight. 🙂';
    if (total === 225) return "Two plates. Now we're talking. 😤";
    if (total === 315) return 'Three plates. Getting heavy. 🥵';
    if (total === goal) return `${goal} lb = 2 × my ${bodyweight} lb bodyweight. 💪`;
    if (total > goal) return `${total}+: the next PR. 🎯`;
    return 'So close… 😬';
  };

  const countTo = (target: number, animate: boolean) => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (!animate || !canAnimate()) {
      shown = target;
      totalText.textContent = String(target);
      return;
    }
    const from = shown;
    let started = 0;
    const step = (now: number) => {
      started ||= now;
      const progress = Math.min(1, (now - started) / 420);
      shown = Math.round(from + (target - from) * (1 - Math.pow(1 - progress, 3)));
      totalText.textContent = String(progress >= 1 ? target : shown);
      frame = progress >= 1 ? 0 : raf(step);
    };
    frame = raf(step);
  };

  const plate = (weight: number, x: number, side: 'left' | 'right') => {
    const { width, height } = PLATE_SIZES[weight];
    const rect = document.createElementNS(SVG, 'rect');
    rect.setAttribute('x', String(side === 'left' ? x - width : x));
    rect.setAttribute('y', String(65 - height / 2));
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('rx', '2');
    rect.setAttribute('class', `plate plate-${String(weight).replace('.', '-')} plate-in-${side}`);
    return rect;
  };

  const update = (animate = true) => {
    const total = totalFor(loaded);
    countTo(total, animate);
    setRichText(note, noteFor(total));
    root.style.setProperty('--bend', ((total - 45) / (totalFor(PLATE_ORDER.length) - 45) * 1.6).toFixed(3));
    root.dataset.total = String(total);
    const next = PLATE_ORDER[loaded];
    add.disabled = next === undefined;
    setRichText(add, next === undefined ? '🎯 Loaded' : `➕ Add ${next}s`);
    live.textContent = total === 45 ? 'Empty 45 pound bar.'
      : `Bar loaded to ${total} pounds.${total === goal ? ` That is twice my ${bodyweight} pound bodyweight.` : ''}`;
    return total;
  };

  add.addEventListener('click', () => {
    const weight = PLATE_ORDER[loaded];
    if (weight === undefined) return;
    // Plates stack outward from the collars, a small gap between each.
    const used = PLATE_ORDER.slice(0, loaded).reduce((sum, value) => sum + PLATE_SIZES[value].width + 1, 0);
    left.append(plate(weight, 58 - used, 'left'));
    right.append(plate(weight, 302 + used, 'right'));
    loaded++;
    const total = update();
    if (total === goal) {
      cheer('2× bodyweight! 💪', '💪');
      burstFrom(root, ['💪', '🏋️', '🔥']);
    } else if (total > goal) {
      cheer('Next PR: 340+ 🎯', '🎯');
      burstFrom(root, ['🎯', '🔥', '🏆']);
    }
  });

  reset.addEventListener('click', () => {
    loaded = 0;
    left.replaceChildren();
    right.replaceChildren();
    update();
  });

  update(false);
  root.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Cube: scramble with real face turns, then solve by undoing them.     */
/* ------------------------------------------------------------------ */
function initCube() {
  const root = pick<HTMLElement>(document, '[data-cube]');
  if (!root) return;
  const stage = pick<HTMLElement>(root, '[data-cube-stage]');
  const status = pick<HTMLElement>(root, '[data-cube-status]');
  const tape = pick<HTMLElement>(root, '[data-cube-tape]');
  const live = pick<HTMLElement>(root, '[data-cube-live]');
  const scrambleButton = pick<HTMLButtonElement>(root, '[data-cube-scramble]');
  const solveButton = pick<HTMLButtonElement>(root, '[data-cube-solve]');
  if (!stage || !status || !tape || !live || !scrambleButton || !solveButton) return;
  const card = root.closest<HTMLElement>('.hobby-card');

  let mode: 'idle' | 'scrambling' | 'solving' | 'manual' = 'idle';
  let solved = true;
  const recent: string[] = [];
  const setStatus = (emoji: string, text: string) => setRichText(status, `${emoji} ${text}`);

  const cube = mountCube(stage, {
    size: 138,
    onChange(event) {
      if (event.type === 'move' && event.move) {
        recent.push(notation(event.move));
        if (recent.length > 10) recent.shift();
        tape.textContent = recent.join(' ');
        if (mode === 'solving') setStatus('✨', `Solving… ${cube.pending().length} to go`);
        return;
      }
      const nowSolved = isSolved(cube.cubies);
      root.dataset.solved = String(nowSolved);
      if (nowSolved) {
        setStatus('✅', 'Solved');
        if (!solved) {
          live.textContent = 'Cube solved.';
          cheer(mode === 'manual' ? 'You solved it?! 🤯' : 'Solved! 🎉', '🎉');
          burstFrom(stage, emojiList(card?.dataset.burst));
        }
      } else {
        setStatus('🌀', 'Scrambled. Your move');
        if (mode === 'scrambling') live.textContent = 'Cube scrambled with 20 random face turns.';
      }
      solved = nowSolved;
      mode = 'idle';
    },
  });

  const play = (moves: Move[], duration: number) => cube.play(moves, { duration, animate: canAnimate() });

  scrambleButton.addEventListener('click', () => {
    mode = 'scrambling';
    setStatus('🌀', 'Scrambling…');
    cheer('Uh oh… 🌀', '🌀');
    play(scramble(20), 120);
  });

  solveButton.addEventListener('click', () => {
    cube.clearQueue();
    const solution = invert([...cube.history, ...cube.pending()]);
    if (!solution.length) {
      setStatus('✅', 'Already solved');
      return;
    }
    mode = 'solving';
    setStatus('✨', `Solving… ${solution.length} to go`);
    play(solution, 110);
  });

  stage.addEventListener('keydown', (event) => {
    const views: Record<string, [number, number]> = {
      ArrowLeft: [0, -15], ArrowRight: [0, 15], ArrowUp: [15, 0], ArrowDown: [-15, 0],
    };
    const turn = views[event.key];
    if (turn) {
      event.preventDefault();
      const { rx, ry } = cube.view();
      cube.setView(rx + turn[0], ry + turn[1]);
      return;
    }
    const face = event.key.toUpperCase() as Face;
    if (event.metaKey || event.ctrlKey || event.altKey || !FACES.includes(face)) return;
    event.preventDefault();
    if (mode === 'idle') mode = 'manual';
    play([{ face, turns: event.shiftKey ? 3 : 1 }], 150);
  });

  let drag: { id: number; x: number; y: number; rx: number; ry: number } | null = null;
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ...cube.view() };
    stage.setPointerCapture?.(event.pointerId);
    stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    cube.setView(drag.rx - (event.clientY - drag.y) * 0.45, drag.ry + (event.clientX - drag.x) * 0.55);
  });
  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    stage.classList.remove('is-dragging');
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  root.dataset.solved = 'true';
  root.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Keepy-uppy: a tiny physics toy that only runs while the ball moves.  */
/* ------------------------------------------------------------------ */
function initKeepy() {
  const root = pick<HTMLElement>(document, '[data-keepy]');
  if (!root || typeof window.matchMedia !== 'function') return;
  const pitch = pick<HTMLElement>(root, '[data-keepy-pitch]');
  const ball = pick<HTMLButtonElement>(root, '[data-keepy-ball]');
  const shadow = pick<HTMLElement>(root, '[data-keepy-shadow]');
  const countText = pick<HTMLElement>(root, '[data-keepy-count]');
  const bestText = pick<HTMLElement>(root, '[data-keepy-best]');
  const live = pick<HTMLElement>(root, '[data-keepy-live]');
  if (!pitch || !ball || !shadow || !countText || !bestText || !live) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SIZE = 46;
  const GRAVITY = 1650;

  // x is measured from the middle of the pitch, y upward from the grass.
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  let spin = 0;
  let angle = 0;
  let airborne = false;
  let touches = 0;
  let best = 0;
  let frame = 0;
  let last = 0;

  const bounds = () => ({ width: pitch.clientWidth || 300, height: pitch.clientHeight || 180 });
  const place = () => {
    ball.style.transform = `translate(${x.toFixed(1)}px, ${(-y).toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;
    const lift = Math.min(1, y / 140);
    shadow.style.transform = `translateX(${x.toFixed(1)}px) scale(${(1 - lift * 0.55).toFixed(3)})`;
    shadow.style.opacity = (0.6 - lift * 0.4).toFixed(3);
  };
  const stop = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  const endStreak = () => {
    const streak = touches;
    if (streak > best) {
      best = streak;
      bestText.textContent = String(best);
      if (best >= 3) {
        cheer(`New best: ${best} touches! 🏆`, '🏆');
        burstFrom(ball, ['⚽', '🏆', '✨']);
      }
    } else if (streak >= 5) cheer('Nice touch! ⚽', '⚽');
    live.textContent = `Dropped after ${streak} ${streak === 1 ? 'touch' : 'touches'}. Best: ${best}.`;
  };
  const step = (now: number) => {
    frame = 0;
    const dt = last ? Math.min(0.032, (now - last) / 1000) : 1 / 60;
    last = now;
    const { width, height } = bounds();
    const half = Math.max(0, (width - SIZE) / 2 - 6);
    vy -= GRAVITY * dt;
    y += vy * dt;
    x += vx * dt;
    angle += spin * dt;
    if (x < -half) { x = -half; vx = Math.abs(vx) * 0.7; spin = -spin * 0.7; }
    if (x > half) { x = half; vx = -Math.abs(vx) * 0.7; spin = -spin * 0.7; }
    if (y > height - SIZE - 12) { y = height - SIZE - 12; vy = -Math.abs(vy) * 0.4; }
    if (y <= 0 && vy <= 0) {
      y = 0;
      if (airborne) {
        airborne = false;
        endStreak();
      }
      vy = -vy * 0.36;
      vx *= 0.72;
      spin *= 0.6;
      if (vy < 80) {
        vy = 0;
        vx *= 0.8;
        if (Math.abs(vx) < 6) {
          place();
          last = 0;
          root.dataset.state = 'idle';
          return;
        }
      }
    }
    place();
    frame = raf(step);
  };

  const kick = (clientX: number | null) => {
    if (motion.matches) return;
    if (!airborne) touches = 0;
    touches++;
    airborne = true;
    countText.textContent = String(touches);
    root.dataset.state = 'playing';
    // Striking the left side sends the ball right, and vice versa.
    const rect = ball.getBoundingClientRect();
    const offset = clientX !== null && rect.width > 0
      ? Math.max(-1, Math.min(1, (rect.left + rect.width / 2 - clientX) / (rect.width / 2)))
      : Math.random() - 0.5;
    vy = 560 + Math.random() * 100;
    vx = Math.max(-260, Math.min(260, offset * 170 + (Math.random() - 0.5) * 80));
    spin = vx * 1.8;
    if (!frame) frame = raf(step);
  };
  // Kick on press for responsiveness; keyboard and assistive clicks arrive as
  // click events without a pointer press (detail 0).
  ball.addEventListener('pointerdown', (event) => {
    if (event.button === 0) kick(event.clientX);
  });
  ball.addEventListener('click', (event) => {
    if (event.detail === 0) kick(null);
  });

  const sync = () => {
    const enabled = !motion.matches;
    root.hidden = !enabled;
    if (!enabled) {
      stop();
      airborne = false;
      x = 0;
      y = 0;
      vx = 0;
      vy = 0;
      angle = 0;
      place();
    }
  };
  if (typeof motion.addEventListener === 'function') motion.addEventListener('change', sync);
  place();
  sync();
}

/* ------------------------------------------------------------------ */
/* Reflex check: wait for the glove, then hit it as fast as possible.   */
/* ------------------------------------------------------------------ */
function initReflex() {
  const root = pick<HTMLElement>(document, '[data-reflex]');
  if (!root) return;
  const pad = pick<HTMLButtonElement>(root, '[data-reflex-pad]');
  const text = pick<HTMLElement>(root, '[data-reflex-text]');
  const bestText = pick<HTMLElement>(root, '[data-reflex-best]');
  const live = pick<HTMLElement>(root, '[data-reflex-live]');
  if (!pad || !text || !bestText || !live) return;

  type State = 'idle' | 'waiting' | 'go' | 'done' | 'early';
  let state: State = 'idle';
  let timer = 0;
  let goAt = 0;
  let best = Infinity;
  let lastAction = -Infinity;
  const set = (next: State, label: string) => {
    state = next;
    pad.dataset.state = next;
    setRichText(text, label);
  };

  const act = () => {
    const now = performance.now();
    lastAction = now;
    if (state === 'waiting') {
      window.clearTimeout(timer);
      set('early', 'Too early! 🙈 Tap to retry');
      live.textContent = 'Too early. Try again.';
      cheer('Too early! 🙈', '🙈');
      return;
    }
    if (state === 'go') {
      const ms = Math.max(1, Math.round(now - (goAt || now)));
      best = Math.min(best, ms);
      bestText.textContent = `${best} ms`;
      const rating = ms < 200 ? '⚡ Lightning' : ms < 260 ? '🥊 Sharp' : ms < 350 ? '👍 Solid' : '😴 Wake up';
      set('done', `${ms} ms · ${rating} · tap to go again`);
      live.textContent = `${ms} milliseconds. Best ${best}.`;
      cheer(ms < 200 ? 'Lightning reflexes! ⚡' : ms < 260 ? 'Quick hands 🥊' : 'Keep those hands up 😅', '🥊');
      return;
    }
    set('waiting', 'Wait for it… 👀');
    live.textContent = 'Wait for the glove.';
    goAt = 0;
    timer = window.setTimeout(() => {
      set('go', 'HIT! 🥊');
      goAt = performance.now();
      // Start the clock when the frame showing the glove is drawn.
      if (typeof window.requestAnimationFrame === 'function') raf(() => { goAt = performance.now(); });
    }, 1200 + Math.random() * 2200);
  };

  // Press-down is timed; the click that follows it is ignored. A click on its
  // own (assistive technology, scripted activation) still works.
  pad.addEventListener('pointerdown', (event) => {
    if (event.button === 0) act();
  });
  pad.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault();
      act();
    }
  });
  pad.addEventListener('click', () => {
    if (performance.now() - lastAction > 700) act();
  });

  root.hidden = false;
}

export function initHobbies() {
  initPoker();
  initBarbell();
  initCube();
  initKeepy();
  initReflex();
}
