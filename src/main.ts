import { initEquity } from "./equity";
import { createJournal, initKill } from "./kill";
import type { Journal } from "./kill";
import { initLab } from "./lab";

// Everything a visitor reads is in index.html. JavaScript adds controls only
// after their handlers are attached, and never loads or invents copy.

function initDisclosures(journal: Journal) {
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
        const expanded = button.getAttribute("aria-expanded") !== "true";
        setExpanded(expanded);
        if (expanded) journal.append("intent", `open ${panel.id}`);
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

// The header takes the ground of whichever band is under it, in one cut.
function initGround() {
  const header = document.getElementById("site-header");
  if (!header || typeof window.requestAnimationFrame !== "function") return;
  const bands = [...document.querySelectorAll<HTMLElement>(".band[data-ground]")];
  let frame = 0;
  const update = () => {
    frame = 0;
    const line = header.getBoundingClientRect().bottom / 2;
    for (const band of bands) {
      const rect = band.getBoundingClientRect();
      if (rect.top <= line && rect.bottom > line) {
        header.dataset.ground = band.dataset.ground;
        return;
      }
    }
  };
  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  update();
}

// Fit-to-width lines carry their natural width in ems as --em, so CSS alone
// sizes them. Measure the real text once the font is in, in case the copy or
// the font differs from what the HTML assumed.
function initFit() {
  const words = [...document.querySelectorAll<HTMLElement>(".name-word")];
  const lines = [...document.querySelectorAll<HTMLElement>(".fit")];
  const natural = (text: HTMLElement): number | null => {
    if (typeof document.createRange !== "function") return null;
    const range = document.createRange();
    if (typeof range.getBoundingClientRect !== "function") return null;
    // Measure a still copy: the name animates in, and a width taken halfway
    // through that animation would size the line for the wrong letterforms.
    const probe = text.cloneNode(true) as HTMLElement;
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText += ";position:absolute;visibility:hidden;animation:none;width:auto;white-space:nowrap";
    text.after(probe);
    range.selectNodeContents(probe);
    const width = range.getBoundingClientRect().width;
    const size = Number.parseFloat(getComputedStyle(probe).fontSize);
    probe.remove();
    if (!width || !size) return null;
    // Negative tracking pulls the measured box in past the last glyph's ink.
    return width / size + 0.02;
  };
  const measure = () => {
    for (const line of lines) {
      const text = line.querySelector<HTMLElement>("span");
      const em = text ? natural(text) : null;
      if (em) line.style.setProperty("--em", em.toFixed(3));
    }
    const widths = words.map(natural);
    const name = words[0]?.closest<HTMLElement>(".name");
    if (!name || widths.some((width) => width === null)) return;
    words.forEach((word, index) => word.style.setProperty("--em", (widths[index] as number).toFixed(3)));
    const gap = 0.26 * Math.max(0, words.length - 1);
    const row = (widths as number[]).reduce((sum, width) => sum + width, 0) + gap;
    name.style.setProperty("--em-row", row.toFixed(3));
  };
  if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {});
  else measure();
}

// Each section is journaled the first time it is read, and the header marks
// the one being read now.
function initAnchors(journal: Journal) {
  if (typeof window.IntersectionObserver !== "function") return;
  const links = [...document.querySelectorAll<HTMLAnchorElement>("#primary-navigation a")];
  const seen = new Set<string>();
  const visible = new Set<Element>();
  const mark = (section: Element) => {
    const group = section.closest("main > section");
    links.forEach((link) => {
      if (link.getAttribute("href") === `#${group?.id}`) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    });
    const name = (section as HTMLElement).dataset.anchor || section.id;
    journal.current = { slot: section.id, label: section.id === "home" ? name : `"${name}"` };
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
      if (entry.isIntersecting && !seen.has(entry.target.id)) {
        seen.add(entry.target.id);
        journal.append("anchor", entry.target.id);
      }
    }
    // The section nearest the reading line wins when two overlap it.
    const line = window.innerHeight * 0.4;
    const reading = [...visible].sort((a, b) =>
      Math.abs(a.getBoundingClientRect().top - line) - Math.abs(b.getBoundingClientRect().top - line))[0];
    if (reading) mark(reading);
  }, { rootMargin: "-30% 0px -55% 0px", threshold: 0 });
  document.querySelectorAll<HTMLElement>("[data-anchor]").forEach((section) => observer.observe(section));
}

const journal = createJournal();
initDisclosures(journal);
initNavigation();
initGround();
initFit();
initAnchors(journal);
initKill(journal);
initLab(journal);
initEquity();
