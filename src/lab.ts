// The crash lab in the Belay case file. Every word of every scenario is in
// index.html; this only decides which scenario is on screen and reveals what
// happens after the kill, one step at a time across all four lanes.
import type { Journal } from "./kill";

const STEP_MS = 520;

export function initLab(journal?: Journal) {
  const lab = document.querySelector<HTMLElement>("[data-lab]");
  if (!lab) return;
  const variants = [...lab.querySelectorAll<HTMLElement>(".lab-variant")];
  const controls = lab.querySelector<HTMLElement>("[data-lab-controls]");
  const scenarios = [...lab.querySelectorAll<HTMLInputElement>('input[name="lab-scenario"]')];
  const persist = lab.querySelector<HTMLInputElement>("[data-lab-persist]");
  const persistLabel = lab.querySelector<HTMLElement>("[data-lab-persist-label]");
  const status = lab.querySelector<HTMLElement>("[data-lab-status]");
  if (!variants.length || !controls || !persist) return;

  const motion = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  let timers: number[] = [];
  const clearTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
  };

  const parts = (variant: HTMLElement) => ({
    killButton: variant.querySelector<HTMLButtonElement>("[data-lab-kill]"),
    seam: variant.querySelector<HTMLElement>("[data-lab-seam]"),
    reset: variant.querySelector<HTMLButtonElement>(".lab-reset"),
    takeaway: variant.querySelector<HTMLElement>("[data-lab-takeaway]"),
    after: [...variant.querySelectorAll<HTMLElement>(".lane")].map((lane) =>
      [...lane.querySelectorAll<HTMLElement>(".after li")]),
    closing: [...variant.querySelectorAll<HTMLElement>(".outcome, .lab-takeaway, .lab-measured")],
  });

  // Armed: the process is running and the kill button sits where the kill lands.
  const arm = (variant: HTMLElement) => {
    clearTimers();
    const { killButton, reset } = parts(variant);
    variant.classList.remove("is-killed", "is-done");
    variant.classList.add("is-armed");
    variant.querySelectorAll(".is-shown").forEach((element) => element.classList.remove("is-shown"));
    if (killButton) killButton.hidden = false;
    if (reset) reset.hidden = true;
    if (status) status.textContent = "";
  };

  const done = (variant: HTMLElement) => {
    const { closing, reset, takeaway } = parts(variant);
    closing.forEach((element) => element.classList.add("is-shown"));
    variant.classList.add("is-done");
    if (reset) reset.hidden = false;
    if (status) status.textContent = takeaway?.textContent?.trim() ?? "";
  };

  const kill = (variant: HTMLElement) => {
    if (!variant.classList.contains("is-armed")) return;
    clearTimers();
    const { killButton, seam, after } = parts(variant);
    variant.classList.remove("is-armed");
    variant.classList.add("is-killed");
    if (killButton) killButton.hidden = true;
    // Focus follows the action: the button is gone, so land on the seam it became.
    if (seam) {
      seam.tabIndex = -1;
      seam.focus({ preventScroll: true });
    }
    journal?.append("intent", `crash lab ${variant.dataset.variant ?? ""}`.trim());

    const longest = Math.max(0, ...after.map((steps) => steps.length));
    const reveal = (index: number) => after.forEach((steps) => steps[index]?.classList.add("is-shown"));
    if (motion?.matches) {
      for (let index = 0; index < longest; index++) reveal(index);
      done(variant);
      return;
    }
    for (let index = 0; index < longest; index++) {
      timers.push(window.setTimeout(() => reveal(index), STEP_MS * (index + 1)));
    }
    timers.push(window.setTimeout(() => done(variant), STEP_MS * (longest + 1)));
  };

  const activeKey = () => {
    const scenario = scenarios.find((input) => input.checked)?.value ?? "ack";
    if (scenario === "revoked") return "revoked";
    return persist.checked ? "ack-persisted" : "ack-inline";
  };

  const show = () => {
    const key = activeKey();
    variants.forEach((variant) => {
      variant.hidden = variant.dataset.variant !== key;
      arm(variant);
    });
    // The journaling rule only applies to the lost-acknowledgement scenario.
    if (persistLabel) persistLabel.hidden = key === "revoked";
  };

  variants.forEach((variant) => {
    const { killButton, takeaway } = parts(variant);
    killButton?.addEventListener("click", () => kill(variant));
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "lab-reset";
    reset.textContent = "Run it again";
    reset.hidden = true;
    reset.addEventListener("click", () => {
      arm(variant);
      killButton?.focus({ preventScroll: true });
    });
    (variant.querySelector(".lab-measured") ?? takeaway ?? variant).after(reset);
  });
  scenarios.forEach((input) => input.addEventListener("change", show));
  persist.addEventListener("change", show);
  // A preference change mid-run finishes the run rather than leaving it half shown.
  motion?.addEventListener?.("change", () => {
    if (!motion.matches) return;
    variants.filter((variant) => variant.classList.contains("is-killed") && !variant.classList.contains("is-done"))
      .forEach((variant) => {
        clearTimers();
        variant.querySelectorAll(".after li").forEach((step) => step.classList.add("is-shown"));
        done(variant);
      });
  });

  controls.hidden = false;
  show();
}
