# Amer Khan's portfolio

A static portfolio built with Vite and TypeScript. Use Node.js 22.12 or later.

## Local development

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

`dev` starts the development server. `test` checks content and interaction contracts. `build` runs TypeScript checks and creates `dist/`; `preview` serves that production build locally.

## Content and behavior

- `index.html` is the authoritative source for copy and final metric values. CSS is linked directly so the page remains styled when JavaScript is disabled.
- `src/style.css` owns the dark purple theme, responsive layout, focus states, and reduced-motion styles. Space Grotesk, Inter, and IBM Plex Mono are self-hosted from the installed Fontsource packages.
- `src/main.ts` progressively enhances navigation, disclosures, counters, the custom cursor, card tilt, and scroll progress. Disclosure content is visible in HTML; JavaScript attaches native button handlers before collapsing panels. Keep this no-JavaScript fallback intact.
- Counter animations are decorative overlays. Final values remain in the source and accessibility tree, including decimal places, commas, and suffixes. Counters animate once as they enter the viewport; reduced motion and unavailable browser APIs leave final values visible.
- `src/companion.ts` and `src/companion.css` animate the decorative robot at its laptop while visitors scroll. It never intercepts clicks. The robot sits in the bottom corner on larger screens and in the header on phones, where it cannot cover the page copy. Captions appear on larger screens; reduced motion keeps the illustration still. The cursor and card tilt are enabled only for a fine pointer without reduced motion, and the native cursor returns for keyboard use.
- The robot also reacts: captions carry an emoji per section, its eyes follow a fine pointer, hovering an element with `data-buddy="…"` shows that line, and any script can cheer through `document.dispatchEvent(new CustomEvent('buddy:say', { detail: { text, pop } }))`. Cheers revert after 2.6 seconds.
- The cursor ring reads three hints: `data-cursor-emoji` (a hobby card's emoji, worn like a sticker), `data-cursor-label` (a short word such as “Drag”), and `data-cursor="chart"` (a small ring that never hides the data under it).

### Hobbies & free time

- The `#hobbies` cards are complete, readable copy without JavaScript. Each card's toy starts `hidden` in the HTML and `src/hobbies.ts` reveals it only after its handlers are attached. None of them schedule work until a visitor uses them, and each stops its loop when it settles.
- Poker: `src/poker.ts` is a 7-card hand evaluator and Monte Carlo equity estimate against one random hand. The tests check it against the exact five-card category counts and published preflop equities. `src/equity-chart.ts` plots the running estimate with its 95% band. It supports hover, touch scrubbing and the arrow keys, and a hidden table lists the checkpoints.
- Lifting: the barbell loads plates toward 330 lb (2 × the 165 lb bodyweight), then the 340 lb target.
- Cube: `src/cube.ts` models each piece with an integer rotation matrix, so scrambles are real face turns and Solve undoes them. The cube can be dragged, turned with the arrow keys, or twisted with U, D, L, R, F and B (Shift reverses).
- Soccer: a keepy-uppy toy that runs physics only while the ball moves; reduced motion hides it. MMA: a reflex check timed from the frame that shows the glove.
- `src/fx.ts` adds decorative emoji bursts on click (fine pointer only), card reveals on scroll, the clickable hero spark, and a Konami-code emoji rain. Everything it creates is `aria-hidden`, skipped under reduced motion, and removed when its animation ends.

When editing claims, use confirmed facts and keep repeated values consistent. The 3.94 GPA applies specifically to CS and math coursework. Belay is the first of four equally styled projects and is not listed as employment. Its hackathon dates are September 12–14, 2026; awards are currently pending, and the $1M+ figure describes the event's prize pool. Update the project notes when results are confirmed.

Hobby facts, as confirmed: a 2× bodyweight bench press, now closing in on 340+ lb at a 165 lb bodyweight; a three-year varsity soccer athlete in high school and a MetroWest Academic All-Star for the 2024–25 season; intramural soccer and basketball at UConn. These values repeat in the lifting stats, the barbell toy (`data-bodyweight`) and the emoji ticker, so update them together.

`public/og-image.svg` is the editable share-image source. Regenerate `public/og-image.png` at 1200 × 630 after changes; Open Graph and Twitter metadata use the PNG. Keep canonical URLs, social metadata, `public/robots.txt`, and `public/sitemap.xml` consistent if the site address changes.

Before publishing, check the production preview at mobile and desktop widths, with keyboard navigation, JavaScript disabled, and reduced motion enabled. Automated tests complement those browser checks.

Publication follows the repository's existing Vercel workflow. A local build or preview does not publish the site.
