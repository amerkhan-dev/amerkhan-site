# Amer Khan's portfolio

A single static page: `index.html` and `style.css`, built with Vite. No JavaScript.

```sh
npm install
npm run dev      # local server
npm run build    # outputs dist/
```

## Editing

- All copy lives in `index.html`. Sections, in order: intro + key numbers, 01 Projects, 02 Experience, 03 Education, 04 Skills.
- Keep numbers consistent where they repeat (the intro stats and the project/experience bullets). The 3.94 GPA is for CS and math coursework. Belay's hackathon awards are pending; update the Belay card when results are in.
- Colors are CSS variables at the top of `style.css`. Fonts (Anton, Newsreader, JetBrains Mono) load from Google Fonts.
- `public/og-image.svg` is the share-image source; regenerate `public/og-image.png` at 1200 × 630 after changing it.

Deploys through the existing Vercel setup on push to `main`.
