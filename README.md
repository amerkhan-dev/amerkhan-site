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
- `src/style.css` owns layout, responsive behavior, focus states, and reduced-motion styles. Manrope and IBM Plex Mono are self-hosted from the installed Fontsource packages.
- `src/main.ts` progressively enhances navigation, disclosures, and the recovery illustration. Disclosure content is visible in HTML; JavaScript attaches native button handlers before collapsing panels. Keep this no-JavaScript fallback intact.
- Metrics remain static. The recovery demo illustrates one predetermined scenario; it does not run Belay, call a model, or move money. Reduced motion skips playback, and resetting cancels pending updates.

When editing claims, use confirmed facts and keep repeated values consistent. The 3.94 GPA applies specifically to CS and math coursework. Belay's hackathon dates are September 12–14, 2026; awards are currently pending, and the $1M+ figure describes the event's prize pool. Update both project and experience copy when results are confirmed.

`public/og-image.svg` is the editable share-image source. Regenerate `public/og-image.png` at 1200 × 630 after changes; Open Graph and Twitter metadata use the PNG. Keep canonical URLs, social metadata, `public/robots.txt`, and `public/sitemap.xml` consistent if the site address changes.

Before publishing, check the production preview at mobile and desktop widths, with keyboard navigation, JavaScript disabled, and reduced motion enabled. Automated tests complement those browser checks.

Publication follows the repository's existing Vercel workflow. A local build or preview does not publish the site.
