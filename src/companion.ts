/** Decorative only: no external calls, content fetching, or continuous JS loop. */
export function initCompanion(): (() => void) | undefined {
  const companion = document.getElementById('scroll-companion');
  if (!companion || typeof window.matchMedia !== 'function') return;

  const caption = companion.querySelector<HTMLElement>('.buddy-caption');
  const pop = companion.querySelector<HTMLElement>('.buddy-pop');
  const art = companion.querySelector<SVGSVGElement>('.buddy-art');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const captions: Record<string, string> = {
    home: 'Booting up… ⚡',
    education: 'Learning mode. 📚',
    experience: 'Putting in work. 💼',
    projects: 'Shipping things. 🚀',
    skills: 'Toolbox open. 🧰',
    hobbies: 'Off the clock! 🎲',
    contact: 'Say hello? 👋',
  };
  let stopTyping: number | undefined;
  let listening = false;

  // What the caption shows, by priority: a reaction to something that just
  // happened, then whatever the pointer is resting on, then the section.
  let sectionCaption = caption?.textContent ?? '';
  let hoverCaption = '';
  let cheerCaption = '';
  let cheerTimer: number | undefined;
  let hoverHost: Element | null = null;
  const showCaption = () => {
    if (caption) caption.textContent = cheerCaption || hoverCaption || sectionCaption;
  };

  const stop = () => {
    if (stopTyping !== undefined) window.clearTimeout(stopTyping);
    stopTyping = undefined;
    companion.classList.remove('is-scrolling');
  };

  const onScroll = () => {
    companion.classList.add('is-scrolling');
    if (stopTyping !== undefined) window.clearTimeout(stopTyping);
    stopTyping = window.setTimeout(stop, 220);
  };

  // The robot's eyes follow a fine pointer. Its box only moves on resize, so
  // the measurement is cached and each pointer move costs two style writes.
  let artBox: DOMRect | null = null;
  const resetGaze = () => {
    companion.style.removeProperty('--gaze-x');
    companion.style.removeProperty('--gaze-y');
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!art || event.pointerType === 'touch' || !fine.matches || motion.matches || document.hidden) return;
    artBox ??= art.getBoundingClientRect();
    // The visor sits near (78, 68) in the 200 × 190 artwork.
    const dx = event.clientX - (artBox.left + artBox.width * 0.39);
    const dy = event.clientY - (artBox.top + artBox.height * 0.36);
    const distance = Math.hypot(dx, dy) || 1;
    const reach = Math.min(1, distance / 220);
    companion.style.setProperty('--gaze-x', `${(dx / distance * 5 * reach).toFixed(2)}px`);
    companion.style.setProperty('--gaze-y', `${(dy / distance * 3.5 * reach).toFixed(2)}px`);
  };
  const onResize = () => { artBox = null; };

  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || !fine.matches) return;
    const host = event.target instanceof Element ? event.target.closest('[data-buddy]') : null;
    if (host === hoverHost) return;
    hoverHost = host;
    hoverCaption = host?.getAttribute('data-buddy') ?? '';
    showCaption();
  };
  const onPointerOut = (event: PointerEvent) => {
    if (event.relatedTarget) return;
    hoverHost = null;
    hoverCaption = '';
    resetGaze();
    showCaption();
  };

  const restart = (element: Element, className: string) => {
    element.classList.remove(className);
    void (element as HTMLElement).offsetWidth;
    element.classList.add(className);
  };
  const onSay = (event: Event) => {
    const { text = '', pop: emoji = '' } = (event as CustomEvent<{ text?: string; pop?: string }>).detail ?? {};
    if (!text) return;
    cheerCaption = text;
    showCaption();
    if (cheerTimer !== undefined) window.clearTimeout(cheerTimer);
    cheerTimer = window.setTimeout(() => {
      cheerTimer = undefined;
      cheerCaption = '';
      companion.classList.remove('is-cheering');
      showCaption();
    }, 2600);
    if (motion.matches) return;
    restart(companion, 'is-cheering');
    if (pop && emoji) {
      pop.textContent = emoji;
      restart(pop, 'is-popping');
    }
  };

  const syncMotion = () => {
    const enabled = !motion.matches && !document.hidden;
    companion.classList.toggle('motion-enabled', enabled);
    if (enabled && !listening) {
      window.addEventListener('scroll', onScroll, { passive: true });
      listening = true;
    } else if (!enabled) {
      window.removeEventListener('scroll', onScroll);
      listening = false;
      stop();
      resetGaze();
      companion.classList.remove('is-cheering');
    }
  };

  // Captions follow the section currently in the central reading area. They
  // remain decorative and do not create an announcement on every scroll.
  const visibleSections = new Set<Element>();
  const observer = typeof window.IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      }
      const readingLine = window.innerHeight * .25;
      const section = [...visibleSections].sort((a, b) =>
        Math.abs(a.getBoundingClientRect().top - readingLine)
        - Math.abs(b.getBoundingClientRect().top - readingLine))[0];
      if (section && captions[section.id]) {
        sectionCaption = captions[section.id];
        showCaption();
      }
    }, { rootMargin: '-12% 0px -42% 0px', threshold: 0 })
    : undefined;

  for (const id of Object.keys(captions)) {
    const section = document.getElementById(id);
    if (section) observer?.observe(section);
  }

  motion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerover', onPointerOver, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('buddy:say', onSay);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('blur', resetGaze);
  syncMotion();

  return () => {
    stop();
    if (cheerTimer !== undefined) window.clearTimeout(cheerTimer);
    window.removeEventListener('scroll', onScroll);
    motion.removeEventListener('change', syncMotion);
    document.removeEventListener('visibilitychange', syncMotion);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerover', onPointerOver);
    document.removeEventListener('pointerout', onPointerOut);
    document.removeEventListener('buddy:say', onSay);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', resetGaze);
    observer?.disconnect();
    resetGaze();
    companion.classList.remove('motion-enabled', 'is-cheering');
  };
}
