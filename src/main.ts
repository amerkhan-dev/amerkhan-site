import { initCompanion } from './companion';

// All portfolio content and final metrics are present in the HTML. JavaScript
// adds controls only after their handlers are attached; it never loads copy.
function initDisclosures() {
  document.querySelectorAll<HTMLButtonElement>(".disclosure-toggle[aria-controls]")
    .forEach((button) => {
      const panelId = button.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      if (!panel?.hasAttribute("data-disclosure-panel")) return;

      const setExpanded = (expanded: boolean) => {
        button.setAttribute("aria-expanded", String(expanded));
        panel.hidden = !expanded;
      };

      button.addEventListener("click", () => {
        setExpanded(button.getAttribute("aria-expanded") !== "true");
      });

      setExpanded(false);
      button.hidden = false;
    });
}

function initNavigation() {
  const header = document.getElementById("site-header");
  const button = document.querySelector<HTMLButtonElement>("#nav-toggle");
  const navigation = document.getElementById("primary-navigation");
  if (!header || !button || !navigation) return;

  const setExpanded = (expanded: boolean) => {
    button.setAttribute("aria-expanded", String(expanded));
    header.dataset.navOpen = String(expanded);
  };

  button.addEventListener("click", () => {
    setExpanded(button.getAttribute("aria-expanded") !== "true");
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      // Leave anchor navigation and focus to the browser, including desktop.
      setExpanded(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || button.getAttribute("aria-expanded") !== "true") return;
    setExpanded(false);
    // CSS hides the toggle on desktop; never focus a hidden control.
    if (button.getClientRects().length) button.focus();
    event.preventDefault();
  });

  setExpanded(false);
  header.classList.add("nav-enhanced");
  button.hidden = false;
}

function watchMedia(query: MediaQueryList, listener: () => void) {
  if (typeof query.addEventListener === "function") query.addEventListener("change", listener);
  else if (typeof query.addListener === "function") query.addListener(listener);
}

function initCounters() {
  if (typeof window.matchMedia !== "function"
    || typeof window.IntersectionObserver !== "function"
    || typeof window.requestAnimationFrame !== "function") return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) return;

  type Counter = {
    element: HTMLElement;
    overlay: HTMLElement;
    target: number;
    prefix: string;
    suffix: string;
    decimals: number;
    grouped: boolean;
    started: number;
  };
  const active = new Set<Counter>();
  let frame = 0;

  const finish = (counter: Counter) => {
    // Restore the original node before removing its decorative replacement.
    counter.element.classList.remove("counter-active");
    counter.overlay.remove();
    active.delete(counter);
  };
  const finishActive = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    [...active].forEach(finish);
  };
  const tick = (now: number) => {
    frame = 0;
    active.forEach((counter) => {
      const progress = Math.min(1, Math.max(0, (now - counter.started) / 1300));
      if (progress >= 1) {
        finish(counter);
        return;
      }
      const value = counter.target * (1 - Math.pow(1 - progress, 3));
      const formatted = value.toLocaleString("en-US", {
        useGrouping: counter.grouped,
        minimumFractionDigits: counter.decimals,
        maximumFractionDigits: counter.decimals,
      });
      counter.overlay.textContent = counter.prefix + formatted + counter.suffix;
    });
    if (active.size) frame = window.requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    if (motion.matches || document.hidden) return;
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const element = entry.target as HTMLElement;
      const original = element.textContent?.trim() ?? "";
      const parsed = original.match(/^([^\d]*)([\d,]+(?:\.\d+)?)([^\d]*)$/);
      if (!parsed) return;
      const target = Number(parsed[2].replaceAll(",", ""));
      if (!Number.isFinite(target) || target <= 0) return;
      const decimals = (parsed[2].split(".")[1] ?? "").length;
      if (decimals > 10) return;

      // The original final content remains accessible and reserves its width.
      // Only a separate, aria-hidden overlay counts up, once it is on screen.
      const source = document.createElement("span");
      source.className = "counter-final";
      while (element.firstChild) source.append(element.firstChild);
      element.append(source);
      const overlay = document.createElement("span");
      overlay.className = "counter-animation";
      overlay.setAttribute("aria-hidden", "true");
      overlay.textContent = original;
      element.append(overlay);
      element.classList.add("counter-active");
      active.add({
        element, overlay, target, prefix: parsed[1], suffix: parsed[3],
        decimals, grouped: parsed[2].includes(","), started: performance.now(),
      });
      if (!frame) frame = window.requestAnimationFrame(tick);
    });
  }, { threshold: 0.15 });

  document.querySelectorAll<HTMLElement>("[data-counter]").forEach((element) => observer.observe(element));
  watchMedia(motion, () => {
    if (!motion.matches) return;
    observer.disconnect();
    finishActive();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finishActive();
  });
}

function initCursor() {
  const dot = document.getElementById("cursorDot");
  const ring = document.getElementById("cursorRing");
  const label = document.getElementById("cursorLabel");
  if (!dot || !ring || !label || typeof window.matchMedia !== "function"
    || typeof window.requestAnimationFrame !== "function") return;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  let x = 0;
  let y = 0;
  let ringX = 0;
  let ringY = 0;
  let tracking = false;
  let frame = 0;
  let lastFrame = 0;

  [dot, ring, label].forEach((element) => element.setAttribute("aria-hidden", "true"));
  const place = (element: HTMLElement, left: number, top: number) => {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
  };
  const render = () => {
    place(dot, x, y);
    place(ring, ringX, ringY);
    place(label, ringX, ringY);
  };
  const reset = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    tracking = false;
    root.classList.remove("cursor-active");
    ring.classList.remove("is-link", "is-view", "is-down");
    label.textContent = "";
  };
  const tick = (now: number) => {
    frame = 0;
    if (!tracking) return;
    const elapsed = lastFrame ? Math.min(now - lastFrame, 64) : 16;
    lastFrame = now;
    const blend = 1 - Math.exp(-elapsed / 42);
    ringX += (x - ringX) * blend;
    ringY += (y - ringY) * blend;
    const settled = Math.abs(x - ringX) < 0.15 && Math.abs(y - ringY) < 0.15;
    if (settled) {
      ringX = x;
      ringY = y;
      lastFrame = 0;
    }
    render();
    // Follow the pointer only while moving; a settled cursor schedules nothing.
    if (!settled) frame = window.requestAnimationFrame(tick);
  };
  const setHover = (target: EventTarget | null) => {
    const interactive = target instanceof Element ? target.closest("a, button, [data-cursor]") : null;
    const view = interactive?.getAttribute("data-cursor") === "view";
    ring.classList.toggle("is-link", Boolean(interactive));
    ring.classList.toggle("is-view", view);
    label.textContent = view ? "View" : "";
  };

  document.addEventListener("pointermove", (event) => {
    if (!fine.matches || motion.matches || document.hidden || event.pointerType === "touch") return;
    x = event.clientX;
    y = event.clientY;
    if (!tracking) {
      ringX = x;
      ringY = y;
      render();
      tracking = true;
      // Coordinates are known before CSS is allowed to hide the native cursor.
      root.classList.add("cursor-active");
    }
    setHover(event.target);
    if (!frame) frame = window.requestAnimationFrame(tick);
  }, { passive: true });
  document.addEventListener("pointerover", (event) => {
    if (tracking) setHover(event.target);
  }, { passive: true });
  document.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) reset();
  }, { passive: true });
  document.addEventListener("pointerdown", () => {
    if (tracking) ring.classList.add("is-down");
  }, { passive: true });
  document.addEventListener("pointerup", () => ring.classList.remove("is-down"), { passive: true });
  document.addEventListener("pointercancel", reset, { passive: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") reset();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
  window.addEventListener("blur", reset);
  watchMedia(fine, reset);
  watchMedia(motion, reset);
}

function initTilt() {
  if (typeof window.matchMedia !== "function"
    || typeof window.requestAnimationFrame !== "function") return;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const resets: Array<() => void> = [];

  document.querySelectorAll<HTMLElement>("[data-tilt]").forEach((element) => {
    let frame = 0;
    let x = 0;
    let y = 0;
    const reset = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      ["--tilt-x", "--tilt-y", "--mx", "--my"].forEach((property) => element.style.removeProperty(property));
    };
    resets.push(reset);
    element.addEventListener("pointermove", (event) => {
      if (!fine.matches || motion.matches || event.pointerType === "touch") return;
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const localX = Math.max(0, Math.min(rect.width, x - rect.left));
        const localY = Math.max(0, Math.min(rect.height, y - rect.top));
        element.style.setProperty("--tilt-x", `${(0.5 - localY / rect.height) * 5}deg`);
        element.style.setProperty("--tilt-y", `${(localX / rect.width - 0.5) * 5}deg`);
        element.style.setProperty("--mx", `${localX}px`);
        element.style.setProperty("--my", `${localY}px`);
      });
    }, { passive: true });
    element.addEventListener("pointerleave", reset, { passive: true });
    element.addEventListener("pointercancel", reset, { passive: true });
  });
  const resetAll = () => resets.forEach((reset) => reset());
  watchMedia(motion, resetAll);
  watchMedia(fine, resetAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetAll();
  });
}

function initScrollProgress() {
  const progress = document.getElementById("progressBar");
  if (!progress || typeof window.requestAnimationFrame !== "function") return;
  let frame = 0;
  const update = () => {
    frame = 0;
    const root = document.documentElement;
    const distance = root.scrollHeight - root.clientHeight;
    const ratio = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
    progress.style.width = `${ratio * 100}%`;
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  update();
}

initDisclosures();
initNavigation();
initCounters();
initCursor();
initTilt();
initScrollProgress();

initCompanion();
