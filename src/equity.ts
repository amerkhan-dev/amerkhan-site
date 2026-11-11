// The equity figure in the poker case file: a Monte Carlo run in the browser,
// set against the exact answer from full enumeration (which lives in the HTML).
import { parseCards, simulate, standardError } from "./poker";
import type { Tally } from "./poker";

const BOARDS = 10000;
const CHUNK = 500;

const percent = (share: number) => `${(100 * share).toFixed(2)}%`;

export function initEquity() {
  const root = document.querySelector<HTMLElement>("[data-equity]");
  if (!root) return;
  const controls = root.querySelector<HTMLElement>("[data-equity-controls]");
  const run = root.querySelector<HTMLButtonElement>("[data-equity-run]");
  const radios = [...root.querySelectorAll<HTMLInputElement>('input[name="equity-matchup"]')];
  const heroLabel = root.querySelector<HTMLElement>("[data-equity-hero]");
  const villainLabel = root.querySelector<HTMLElement>("[data-equity-villain]");
  const value = root.querySelector<HTMLElement>("[data-equity-value]");
  const label = root.querySelector<HTMLElement>("[data-equity-label]");
  const meter = root.querySelector<HTMLElement>("[data-equity-meter]");
  const fill = meter?.querySelector<HTMLElement>(".meter-fill");
  const meta = root.querySelector<HTMLElement>("[data-equity-meta]");
  if (!controls || !run || !heroLabel || !villainLabel || !value || !label || !meter || !fill || !meta) return;

  const status = document.createElement("p");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(status);

  const motion = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  let timer = 0;

  const matchup = () => {
    const key = radios.find((input) => input.checked)?.value ?? "aces";
    const data = root.querySelector<HTMLElement>(`[data-matchup="${key}"]`)?.dataset;
    if (!data) return null;
    const boards = Number(data.boards);
    return {
      hero: data.hero ?? "",
      villain: data.villain ?? "",
      heroLabel: data.heroLabel ?? "",
      villainLabel: data.villainLabel ?? "",
      exactWin: Number(data.wins) / boards,
      exactTie: Number(data.ties) / boards,
      boards,
    };
  };

  const paint = (share: number, heroName: string) => {
    value.textContent = percent(share);
    label.textContent = `win share for ${heroName}`;
    fill.style.setProperty("--v", (100 * share).toFixed(2));
    meter.setAttribute("aria-label", `${heroName} wins ${percent(share)} of boards`);
  };

  const stop = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    run.disabled = false;
  };

  // Before a run, the figure shows the exact answer.
  const showExact = () => {
    stop();
    const hand = matchup();
    if (!hand) return;
    heroLabel.textContent = hand.heroLabel;
    villainLabel.textContent = hand.villainLabel;
    paint(hand.exactWin, hand.heroLabel);
    meta.textContent = `Exact, by scoring all ${hand.boards.toLocaleString("en-US")} possible boards: `
      + `wins ${percent(hand.exactWin)}, ties ${percent(hand.exactTie)}.`;
    status.textContent = "";
  };

  const report = (tally: Tally, hand: NonNullable<ReturnType<typeof matchup>>) => {
    const share = tally.wins / tally.boards;
    paint(share, hand.heroLabel);
    meta.textContent = `After ${tally.boards.toLocaleString("en-US")} random boards: wins ${percent(share)}, `
      + `ties ${percent(tally.ties / tally.boards)}, give or take ${percent(standardError(tally))}. `
      + `Exact answer: ${percent(hand.exactWin)}.`;
  };

  const deal = () => {
    stop();
    const hand = matchup();
    if (!hand) return;
    const hero = parseCards(hand.hero);
    const villain = parseCards(hand.villain);
    const tally: Tally = { boards: 0, wins: 0, ties: 0, losses: 0 };
    const finish = () => {
      report(tally, hand);
      status.textContent = meta.textContent ?? "";
      run.disabled = false;
    };
    if (motion?.matches) {
      simulate(hero, villain, BOARDS, Math.random, tally);
      finish();
      return;
    }
    run.disabled = true;
    const step = () => {
      simulate(hero, villain, CHUNK, Math.random, tally);
      if (tally.boards >= BOARDS) {
        timer = 0;
        finish();
        return;
      }
      report(tally, hand);
      timer = window.setTimeout(step, 45);
    };
    step();
  };

  radios.forEach((input) => input.addEventListener("change", showExact));
  run.addEventListener("click", deal);
  controls.hidden = false;
}
