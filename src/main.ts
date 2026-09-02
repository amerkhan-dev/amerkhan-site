import "./style.css";

const isTouch = window.matchMedia("(hover: none)").matches;

/* ------------------------------------------------------------------ */
/* Custom cursor                                                       */
/* ------------------------------------------------------------------ */
function initCursor() {
  if (isTouch) return;

  const dot = document.getElementById("cursorDot")!;
  const ring = document.getElementById("cursorRing")!;
  const label = document.getElementById("cursorLabel")!;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX = mouseX;
  let ringY = mouseY;

  window.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = `${mouseX}px`;
    dot.style.top = `${mouseY}px`;
  });

  function raf() {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    ring.style.left = `${ringX}px`;
    ring.style.top = `${ringY}px`;
    requestAnimationFrame(raf);
  }
  raf();

  window.addEventListener("mousedown", () => ring.classList.add("is-down"));
  window.addEventListener("mouseup", () => ring.classList.remove("is-down"));

  document.addEventListener("mouseover", (e) => {
    const target = (e.target as HTMLElement).closest("[data-cursor]") as HTMLElement | null;
    if (!target) return;
    const kind = target.dataset.cursor;
    if (kind === "link") {
      ring.classList.add("is-link");
    } else if (kind === "view") {
      ring.classList.add("is-view");
      label.textContent = "View";
    }
  });
  document.addEventListener("mouseout", (e) => {
    const target = (e.target as HTMLElement).closest("[data-cursor]") as HTMLElement | null;
    if (!target) return;
    ring.classList.remove("is-link", "is-view");
    label.textContent = "";
  });

  window.addEventListener("mouseleave", () => {
    dot.style.opacity = "0";
    ring.style.opacity = "0";
  });
  window.addEventListener("mouseenter", () => {
    dot.style.opacity = "1";
    ring.style.opacity = "1";
  });
}

/* ------------------------------------------------------------------ */
/* Particle network background                                         */
/* ------------------------------------------------------------------ */
function initParticles() {
  const canvas = document.getElementById("bg-canvas") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

  interface P { x: number; y: number; vx: number; vy: number; r: number; }
  let particles: P[] = [];
  let mouse = { x: -9999, y: -9999 };

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(90, Math.floor((w * h) / 16000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.6,
    }));
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener("mouseleave", () => { mouse.x = -9999; mouse.y = -9999; });

  const maxDist = 130;

  function tick() {
    ctx.clearRect(0, 0, w, h);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 22500) {
        const d = Math.sqrt(d2) || 1;
        const force = (150 - d) / 150;
        p.x -= (dx / d) * force * 1.1;
        p.y -= (dy / d) * force * 1.1;
      }
    }

    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const alpha = (1 - dist / maxDist) * 0.35;
          ctx.strokeStyle = `rgba(170, 120, 255, ${alpha})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(200, 168, 255, 0.75)";
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }

  resize();
  tick();
}

/* ------------------------------------------------------------------ */
/* Scroll reveal                                                       */
/* ------------------------------------------------------------------ */
function initReveal() {
  const els = document.querySelectorAll<HTMLElement>(".reveal");
  els.forEach((el) => {
    const delay = el.dataset.delay;
    if (delay) el.style.setProperty("--d", delay);
  });

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -60px 0px" }
  );
  els.forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* Count-up numbers                                                    */
/* ------------------------------------------------------------------ */
function initCounters() {
  const nums = document.querySelectorAll<HTMLElement>("[data-count]");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const target = parseFloat(el.dataset.count!);
        const suffix = el.dataset.suffix || "";
        const prefix = el.dataset.prefix || "";
        const isDecimal = el.dataset.count!.includes(".");
        const duration = 1400;
        const start = performance.now();

        function frame(now: number) {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          const val = target * eased;
          const shown = isDecimal ? val.toFixed(2) : Math.round(val).toLocaleString("en-US");
          el.textContent = prefix + shown + suffix;
          if (t < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
        io.unobserve(el);
      });
    },
    { threshold: 0.6 }
  );
  nums.forEach((el) => io.observe(el));
}

/* ------------------------------------------------------------------ */
/* Role accordions                                                     */
/* ------------------------------------------------------------------ */
function initAccordions() {
  document.querySelectorAll<HTMLButtonElement>(".role-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".role-card")!;
      const open = card.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", String(open));
    });
  });
}

/* ------------------------------------------------------------------ */
/* Tilt cards                                                          */
/* ------------------------------------------------------------------ */
function initTilt() {
  if (isTouch) return;
  const cards = document.querySelectorAll<HTMLElement>("[data-tilt]");
  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rx = ((y / rect.height) - 0.5) * -6;
      const ry = ((x / rect.width) - 0.5) * 6;
      card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/* ------------------------------------------------------------------ */
/* Education card glow follows mouse                                   */
/* ------------------------------------------------------------------ */
function initSpotlight() {
  if (isTouch) return;
  const card = document.querySelector<HTMLElement>(".edu-card");
  if (!card) return;
  card.addEventListener("mousemove", (e) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    card.style.setProperty("--my", `${e.clientY - rect.top}px`);
  });
}

/* ------------------------------------------------------------------ */
/* Nav: scroll state + mobile toggle + progress bar                    */
/* ------------------------------------------------------------------ */
function initNav() {
  const nav = document.getElementById("nav")!;
  const progress = document.getElementById("progressBar")!;

  function onScroll() {
    nav.classList.toggle("scrolled", window.scrollY > 20);
    const h = document.documentElement;
    const scrolled = (h.scrollTop) / (h.scrollHeight - h.clientHeight);
    progress.style.width = `${Math.min(100, Math.max(0, scrolled * 100))}%`;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const toggle = document.getElementById("navToggle");
  const links = document.querySelector(".nav-links");
  toggle?.addEventListener("click", () => {
    links?.classList.toggle("mobile-open");
    if (links?.classList.contains("mobile-open")) {
      Object.assign((links as HTMLElement).style, {
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: "64px",
        right: "20px",
        background: "rgba(10,6,18,0.96)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "12px",
        backdropFilter: "blur(16px)",
      });
    } else {
      (links as HTMLElement).style.display = "";
    }
  });

  document.querySelectorAll(".nav-links a").forEach((a) => {
    a.addEventListener("click", () => {
      links?.classList.remove("mobile-open");
      (links as HTMLElement).style.display = "";
    });
  });
}

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */
initCursor();
initParticles();
initReveal();
initCounters();
initTilt();
initAccordions();
initSpotlight();
initNav();
