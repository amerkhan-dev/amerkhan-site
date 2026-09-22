/**
 * A single-series line chart of a Monte Carlo equity estimate as the number of
 * simulated boards grows, with its 95% confidence band. Hover, touch-scrub or
 * arrow keys move a crosshair; a hidden table carries the checkpoints.
 */
export type EquityPoint = { trials: number; equity: number; low: number; high: number };

const SVG = 'http://www.w3.org/2000/svg';
const HEIGHT = 128;
const MARGIN = { top: 10, right: 52, bottom: 22, left: 40 };
const LINE = '#ebc463'; // --gold-400; validated against the dark card surface
const CHECKPOINTS = [250, 1000, 5000, 10000, 20000];

const percent = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const runs = (value: number) => (value >= 1000 ? `${value / 1000}k` : String(value));

function node<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>, text?: string) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function niceStep(span: number) {
  return [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25].find((step) => span / step <= 4) ?? 0.5;
}

export function createEquityChart(plot: HTMLElement, options: { maxTrials: number; table?: HTMLTableSectionElement | null }) {
  const svg = node('svg', { class: 'equity-svg', height: HEIGHT, 'aria-hidden': 'true', focusable: 'false' });
  plot.prepend(svg);
  const tip = plot.querySelector<HTMLElement>('[data-chart-tip]');
  let points: EquityPoint[] = [];
  let shown = 0;
  let active = -1;
  let domain: [number, number] = [0.3, 0.7];

  const width = () => Math.max(220, plot.clientWidth || 320);

  function draw() {
    const w = width();
    const innerW = w - MARGIN.left - MARGIN.right;
    const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const [lo, hi] = domain;
    const x = (trials: number) => MARGIN.left + (trials / options.maxTrials) * innerW;
    const y = (value: number) => MARGIN.top + (1 - (value - lo) / (hi - lo)) * innerH;
    svg.setAttribute('width', String(w));
    svg.setAttribute('viewBox', `0 0 ${w} ${HEIGHT}`);
    svg.replaceChildren();

    const visible = points.slice(0, shown);
    // Recessive hairline grid with clean percentage ticks, once there is data.
    if (visible.length) {
      const step = niceStep(hi - lo);
      const digits = step < 0.05 && Math.round(step * 1000) % 10 !== 0 ? 1 : 0;
      for (let tick = Math.ceil(lo / step) * step; tick <= hi + 1e-9; tick += step) {
        const ty = y(tick);
        svg.append(node('line', { class: 'equity-grid', x1: MARGIN.left, x2: MARGIN.left + innerW, y1: ty, y2: ty }));
        svg.append(node('text', { class: 'equity-tick', x: MARGIN.left - 8, y: ty + 3.5, 'text-anchor': 'end' }, percent(tick, digits)));
      }
    }
    const base = MARGIN.top + innerH;
    svg.append(node('line', { class: 'equity-axis', x1: MARGIN.left, x2: MARGIN.left + innerW, y1: base, y2: base }));
    for (const [trials, anchor] of [[0, 'start'], [options.maxTrials / 2, 'middle'], [options.maxTrials, 'end']] as const) {
      svg.append(node('text', { class: 'equity-tick', x: x(trials), y: HEIGHT - 5, 'text-anchor': anchor }, runs(trials)));
    }

    if (!visible.length) {
      svg.append(node('text', { class: 'equity-empty', x: MARGIN.left + innerW / 2, y: MARGIN.top + innerH / 2 + 4, 'text-anchor': 'middle' },
        'Deal a hand to plot the convergence'));
      return;
    }

    const band = visible.map((point) => `${x(point.trials).toFixed(1)},${y(point.high).toFixed(1)}`)
      .concat([...visible].reverse().map((point) => `${x(point.trials).toFixed(1)},${y(point.low).toFixed(1)}`));
    svg.append(node('path', { class: 'equity-band', d: `M${band.join('L')}Z`, fill: LINE }));
    svg.append(node('path', {
      class: 'equity-line', stroke: LINE,
      d: `M${visible.map((point) => `${x(point.trials).toFixed(1)},${y(point.equity).toFixed(1)}`).join('L')}`,
    }));

    const last = visible[visible.length - 1];
    svg.append(node('circle', { class: 'equity-dot', cx: x(last.trials), cy: y(last.equity), r: 4, fill: LINE }));
    svg.append(node('text', { class: 'equity-end', x: x(last.trials) + 9, y: y(last.equity) + 4 }, percent(last.equity)));

    if (active >= 0 && active < visible.length) {
      const point = visible[active];
      const px = x(point.trials);
      svg.append(node('line', { class: 'equity-crosshair', x1: px, x2: px, y1: MARGIN.top, y2: base }));
      svg.append(node('circle', { class: 'equity-dot', cx: px, cy: y(point.equity), r: 4, fill: LINE }));
      if (tip) {
        tip.hidden = false;
        tip.replaceChildren();
        const value = document.createElement('strong');
        value.textContent = percent(point.equity);
        const detail = document.createElement('span');
        detail.textContent = `± ${percent((point.high - point.low) / 2)} · ${point.trials.toLocaleString('en-US')} runs`;
        tip.append(value, detail);
        tip.style.left = `${Math.min(Math.max(px, 70), w - 70)}px`;
      }
    } else if (tip) tip.hidden = true;
  }

  function setActive(index: number) {
    active = Math.max(-1, Math.min(shown - 1, index));
    draw();
  }

  plot.addEventListener('pointermove', (event) => {
    if (!shown) return;
    const rect = plot.getBoundingClientRect();
    const innerW = width() - MARGIN.left - MARGIN.right;
    const trials = ((event.clientX - rect.left - MARGIN.left) / innerW) * options.maxTrials;
    let nearest = 0;
    points.slice(0, shown).forEach((point, index) => {
      if (Math.abs(point.trials - trials) < Math.abs(points[nearest].trials - trials)) nearest = index;
    });
    if (nearest !== active) setActive(nearest);
  });
  plot.addEventListener('pointerleave', () => setActive(-1));
  plot.addEventListener('focus', () => setActive(shown - 1));
  plot.addEventListener('blur', () => setActive(-1));
  plot.addEventListener('keydown', (event) => {
    if (!shown) return;
    const moves: Record<string, number> = {
      ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: shown - 1,
      PageUp: active - 10, PageDown: active + 10,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive(Math.max(0, moves[event.key]));
  });
  window.addEventListener('resize', () => { if (plot.isConnected) draw(); }, { passive: true });

  function fillTable() {
    if (!options.table) return;
    options.table.replaceChildren();
    for (const checkpoint of CHECKPOINTS) {
      const point = points.find((candidate) => candidate.trials === checkpoint);
      if (!point) continue;
      const row = document.createElement('tr');
      for (const text of [point.trials.toLocaleString('en-US'), percent(point.equity), `${percent(point.low)} to ${percent(point.high)}`]) {
        const cell = document.createElement('td');
        cell.textContent = text;
        row.append(cell);
      }
      options.table.append(row);
    }
  }

  return {
    /** Redraws at the plot's current width (call after it becomes visible). */
    refresh: draw,
    /** Replaces the data; the y-range fits every point so the reveal never rescales. */
    setData(next: EquityPoint[]) {
      points = next;
      shown = 0;
      active = -1;
      const low = Math.min(...next.map((point) => point.low));
      const high = Math.max(...next.map((point) => point.high));
      const middle = (low + high) / 2;
      const half = Math.max(0.035, (high - low) / 2 * 1.12);
      domain = [Math.max(0, middle - half), Math.min(1, middle + half)];
      fillTable();
      draw();
    },
    show(count: number) {
      shown = Math.max(0, Math.min(points.length, count));
      if (active >= shown) active = -1;
      draw();
    },
    clear() {
      points = [];
      shown = 0;
      active = -1;
      fillTable();
      draw();
    },
  };
}
