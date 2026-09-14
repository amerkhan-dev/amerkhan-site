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

When editing claims, use confirmed facts and keep repeated values consistent. The 3.94 GPA applies specifically to CS and math coursework. Belay is the first of four equally styled projects and is not listed as employment. Its hackathon dates are September 12–14, 2026; awards are currently pending, and the $1M+ figure describes the event's prize pool. Update the project notes when results are confirmed.

`public/og-image.svg` is the editable share-image source. Regenerate `public/og-image.png` at 1200 × 630 after changes; Open Graph and Twitter metadata use the PNG. Keep canonical URLs, social metadata, `public/robots.txt`, and `public/sitemap.xml` consistent if the site address changes.

Before publishing, check the production preview at mobile and desktop widths, with keyboard navigation, JavaScript disabled, and reduced motion enabled. Automated tests complement those browser checks.

Publication follows the repository's existing Vercel workflow. A local build or preview does not publish the site.
