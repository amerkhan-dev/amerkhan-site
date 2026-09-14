/** Decorative only: no external calls, content fetching, or continuous JS loop. */
export function initCompanion(): (() => void) | undefined {
  const companion = document.getElementById('scroll-companion');
  if (!companion || typeof window.matchMedia !== 'function') return;

  const caption = companion.querySelector<HTMLElement>('.buddy-caption');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const captions: Record<string, string> = {
    home: 'Booting up…',
    education: 'Learning mode.',
    experience: 'Putting in work.',
    projects: 'Shipping things.',
    skills: 'Toolbox open.',
    contact: 'Say hello?',
  };
  let stopTyping: number | undefined;
  let listening = false;

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
      if (caption && section && captions[section.id]) {
        caption.textContent = captions[section.id];
      }
    }, { rootMargin: '-12% 0px -42% 0px', threshold: 0 })
    : undefined;

  for (const id of Object.keys(captions)) {
    const section = document.getElementById(id);
    if (section) observer?.observe(section);
  }

  motion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();

  return () => {
    stop();
    window.removeEventListener('scroll', onScroll);
    motion.removeEventListener('change', syncMotion);
    document.removeEventListener('visibilitychange', syncMotion);
    observer?.disconnect();
    companion.classList.remove('motion-enabled');
  };
}
