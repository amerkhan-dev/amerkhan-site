// The kill switch. The page keeps a small journal of what the visitor has
// done; `kill -9` cuts the page to black and recovery reads that journal back,
// the way Belay recovers an interrupted agent action. Nothing is stored or
// sent: the journal lives in memory and is gone when the tab closes.

export type JournalRecord = { n: number; kind: string; slot: string; anchor: string };

export type Journal = {
  readonly pid: number;
  readonly records: JournalRecord[];
  append(kind: string, slot: string): JournalRecord;
  /** The section being read right now, and a readable name for it. */
  current: { slot: string; label: string };
};

function hex(length: number): string {
  const alphabet = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(Math.random() * 16)];
  return out;
}

export function formatRecord(record: JournalRecord): string {
  const anchor = record.anchor ? `  ${record.anchor}` : "";
  return `#${String(record.n).padStart(4, "0")}  ${record.kind}  ${record.slot}${anchor}`;
}

export function createJournal(): Journal {
  const tails = document.querySelectorAll<HTMLElement>("[data-journal-tail]");
  const journal: Journal = {
    pid: 1000 + Math.floor(Math.random() * 9000),
    records: [],
    current: { slot: "home", label: "the top" },
    append(kind, slot) {
      // An anchor's identity is minted once, when the record is written.
      const record = { n: journal.records.length + 1, kind, slot, anchor: kind === "anchor" ? hex(8) : "" };
      journal.records.push(record);
      tails.forEach((tail) => { tail.textContent = formatRecord(record); });
      return record;
    },
  };
  journal.append("attempt_start", `pid ${journal.pid}`);
  return journal;
}

type LogLine = { text: string; tone?: "is-dead" | "is-ok" | "is-quiet"; at: number };

export function initKill(journal: Journal) {
  const overlay = document.getElementById("crash");
  const log = document.getElementById("crash-log");
  const skip = document.querySelector<HTMLButtonElement>("#crash-skip");
  const dots = document.getElementById("crash-anchors");
  const toast = document.getElementById("toast");
  const triggers = [...document.querySelectorAll<HTMLButtonElement>("[data-kill]")];
  if (!overlay || !log || !skip || !dots || !toast || !triggers.length) return;

  const motion = typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;
  const background = [...document.querySelectorAll<HTMLElement>("#site-header, #main, .footer")];
  let timers: number[] = [];
  let toastTimer = 0;
  let dead = false;
  let opener: HTMLElement | null = null;

  const later = (callback: () => void, delay: number) => {
    timers.push(window.setTimeout(callback, delay));
  };
  const clearTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
  };

  const script = (): LogLine[] => {
    const anchors = journal.records.filter((record) => record.kind === "anchor");
    const here = anchors.findLast((record) => record.slot === journal.current.slot) ?? anchors.at(-1);
    const depth = Math.max(0, Math.round(window.scrollY || 0)).toLocaleString("en-US");
    const count = journal.records.length;
    return [
      { at: 0, tone: "is-quiet", text: `$ kill -9 ${journal.pid}` },
      { at: 60, tone: "is-dead", text: "amerkhan.page: killed (SIGKILL), exit status 137" },
      { at: 900, tone: "is-quiet", text: "\n$ amerkhan.page --recover" },
      { at: 1160, text: `journal    ${count} record${count === 1 ? "" : "s"}, tail intact` },
      { at: 1420, text: `anchors    ${anchors.length} durable, 0 re-minted` },
      { at: 1680, text: `intent     reading ${journal.current.label}` },
      { at: 1940, text: "model      not re-invoked: the intent was already durable" },
      { at: 2200, text: `reconcile  anchor ${here?.anchor ?? "(none yet)"} committed once` },
      { at: 2460, text: `resume     ${journal.current.label}, ${depth}px down` },
      { at: 2800, tone: "is-ok", text: "recovered. 0 duplicate effects." },
    ];
  };

  const print = (line: LogLine) => {
    const row = document.createElement("span");
    if (line.tone) row.className = line.tone;
    row.textContent = `${line.text}\n`;
    log.append(row);
  };

  // The only things that survive the kill are the anchors: every durable
  // mark on screen keeps its place on the black.
  const pinAnchors = () => {
    dots.replaceChildren();
    const marks = [...document.querySelectorAll<HTMLElement>("#main .dot")].slice(0, 400);
    for (const mark of marks) {
      const rect = mark.getBoundingClientRect();
      if (!rect.width || rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const pin = document.createElement("span");
      pin.style.left = `${rect.left + rect.width / 2}px`;
      pin.style.top = `${rect.top + rect.height / 2}px`;
      dots.append(pin);
    }
  };

  const hideToast = () => {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = 0;
    toast.hidden = true;
    toast.replaceChildren();
  };

  const showToast = () => {
    hideToast();
    const message = document.createElement("span");
    message.textContent = "Recovered from the journal. Nothing ran twice.";
    const link = document.createElement("a");
    link.href = "#belay-lab";
    link.textContent = "See how Belay does it";
    link.addEventListener("click", hideToast);
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", hideToast);
    toast.append(message, link, dismiss);
    toast.hidden = false;
    toastTimer = window.setTimeout(hideToast, 12000);
  };

  const restartBoot = () => {
    if (motion?.matches) return;
    document.querySelectorAll<HTMLElement>(".name-word").forEach((word) => {
      word.style.animation = "none";
      void word.offsetWidth; // flush, so removing the override restarts the animation
      word.style.animation = "";
    });
  };

  const finish = () => {
    if (!dead) return;
    dead = false;
    clearTimers();
    overlay.hidden = true;
    overlay.classList.remove("is-live");
    document.documentElement.classList.remove("is-dead");
    background.forEach((element) => element.removeAttribute("inert"));
    journal.append("attempt_start", `pid ${journal.pid} recovered`);
    restartBoot();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
    showToast();
  };

  const kill = (trigger: HTMLElement) => {
    if (dead) return;
    dead = true;
    opener = trigger;
    hideToast();
    journal.append("intent", "kill -9");
    pinAnchors();
    log.replaceChildren();
    overlay.classList.remove("is-live");
    overlay.hidden = false;
    document.documentElement.classList.add("is-dead");
    background.forEach((element) => element.setAttribute("inert", ""));

    const lines = script();
    if (motion?.matches) {
      // No timed sequence: show the whole recovery and wait to be dismissed.
      lines.forEach(print);
      skip.textContent = "Resume the page";
    } else {
      skip.textContent = "Skip the recovery";
      lines.forEach((line) => later(() => print(line), line.at));
      later(() => overlay.classList.add("is-live"), 3300);
      later(finish, 3550);
    }
    skip.focus({ preventScroll: true });
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => kill(trigger));
    trigger.hidden = false;
  });
  skip.addEventListener("click", finish);
  // The overlay is modal: one control, and Escape leaves.
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      event.preventDefault();
      skip.focus();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!dead || event.key !== "Escape") return;
    event.preventDefault();
    finish();
  });
  document.querySelectorAll<HTMLElement>("[data-kill-invite], [data-journal-note]")
    .forEach((element) => { element.hidden = false; });
}
