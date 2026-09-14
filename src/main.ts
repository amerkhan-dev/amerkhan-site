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

function initRecoveryDemo() {
  const demo = document.getElementById("recovery-demo");
  const run = document.querySelector<HTMLButtonElement>("#demo-run");
  const reset = document.querySelector<HTMLButtonElement>("#demo-reset");
  const status = document.getElementById("demo-status");
  const title = document.getElementById("demo-title");
  const caption = document.getElementById("demo-caption");
  const stageTrack = document.getElementById("demo-stage-track");
  const trace = document.getElementById("demo-trace");
  if (!demo || !run || !reset || !status || !title || !caption || !stageTrack || !trace) return;

  const stages = ["anchor", "payment", "crash", "recovery"] as const;
  type Stage = typeof stages[number];
  const copy: Record<Stage, { title: string; caption: string; status: string }> = {
    anchor: {
      title: "Identity saved.",
      caption: "A stable action ID is written to the journal before the agent decides.",
      status: "Step 1 of 4: action identity is durably recorded.",
    },
    payment: {
      title: "The payment goes through.",
      caption: "The provider commits the payment. The agent has not recorded its receipt yet.",
      status: "Step 2 of 4: one payment commits at the provider.",
    },
    crash: {
      title: "Then the process crashes.",
      caption: "The receipt is missing, but the original action ID survives in the journal.",
      status: "Step 3 of 4: the process stops before recording confirmation.",
    },
    recovery: {
      title: "One payment. Recovered.",
      caption: "Recovery checks the original action against provider evidence and confirms the payment without sending another.",
      status: "Illustration complete: the original payment is confirmed. No duplicate payment is sent.",
    },
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const timers = new Set<number>();
  let running = false;

  const cancelTimers = () => {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
  };

  const setRunning = (value: boolean) => {
    running = value;
    demo.dataset.running = String(value);
    run.disabled = value;
  };

  const markStages = (current: number, complete: boolean) => {
    stages.forEach((stage, index) => {
      const state = index < current || (complete && index === current)
        ? "complete" : index === current ? "active" : "pending";
      const nodes = [
        stageTrack.querySelector<HTMLElement>(`.trace-step[data-stage="${stage}"]`),
        trace.querySelector<HTMLElement>(`[data-trace="${stage}"]`),
      ];
      nodes.forEach((node) => {
        if (!node) return;
        node.dataset.status = state;
        if (state === "active") node.setAttribute("aria-current", "step");
        else node.removeAttribute("aria-current");
      });
    });
  };

  const showStage = (stage: Stage) => {
    demo.dataset.state = stage;
    title.textContent = copy[stage].title;
    caption.textContent = copy[stage].caption;
    status.textContent = copy[stage].status;
    markStages(stages.indexOf(stage), stage === "recovery");
  };

  const finish = () => {
    cancelTimers();
    setRunning(false);
    showStage("recovery");
    run.textContent = "Run again";
  };

  const showReady = () => {
    cancelTimers();
    setRunning(false);
    demo.dataset.state = "ready";
    title.textContent = "One action. A durable record.";
    caption.textContent = "Follow one action through a saved identity, a payment, an interruption, and recovery.";
    status.textContent = "Ready to run the crash scenario.";
    run.textContent = "Run crash test";
    markStages(-1, false);
  };

  // This is a predetermined explanation of one recovery path, not a runtime
  // benchmark. No model, payment API, or external service is called. The HTML's
  // 'Payments after recovery' value remains 1 throughout this illustration.
  run.addEventListener("click", () => {
    if (running) return;
    cancelTimers();
    if (reducedMotion.matches) {
      finish();
      return;
    }

    setRunning(true);
    showStage("anchor");
    const schedule = (delay: number, action: () => void) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        action();
      }, delay);
      timers.add(timer);
    };
    schedule(900, () => showStage("payment"));
    schedule(1850, () => showStage("crash"));
    schedule(3200, finish);
  });

  reset.addEventListener("click", showReady);
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches && running) finish();
  });

  showReady();
  run.hidden = false;
  reset.hidden = false;
}

initDisclosures();
initNavigation();
initRecoveryDemo();
