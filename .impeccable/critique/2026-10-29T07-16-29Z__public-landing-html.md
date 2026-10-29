---
target: the landing page
total_score: 19
max_score: 32
na_heuristics: 7,10
p0_count: 1
p1_count: 3
target_identity: "file:D:\\reviewer ai\\review-signal\\public\\landing.html"
target_fingerprint: "sha256:e5c78f3a124e831538e75ac985563d0aa051150877b3acd8d228fcd8bfa2e41b"
target_path: "D:\\reviewer ai\\review-signal\\public\\landing.html"
timestamp: 2026-10-29T07-16-29Z
slug: public-landing-html
---
# Critique — public/landing.html

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Theme toggle visible; sticky header has no scroll-state or nav active-section cue. |
| 2 | Match System / Real World | 2 | "Jev · TypeSafe AI", "Likeliness", "NPS impact" appear before any gloss. |
| 3 | User Control and Freedom | 3 | Anchor nav + theme toggle; theme state likely doesn't persist into /app. |
| 4 | Consistency and Standards | 1 | Internal/external gap: landing is Tailwind-indigo-stock; app uses Inter Tight, #4b47e6, custom tokens. |
| 5 | Error Prevention | 3 | Few failure surfaces; mostly fine. |
| 6 | Recognition Rather Than Recall | 2 | Feature-card icons meaningless; jargon tokens repeat without definition. |
| 7 | Flexibility and Efficiency | n/a | Persuade surface — no power-user path required. |
| 8 | Aesthetic and Minimalist Design | 2 | Rainbow icon tiles, decorative eyebrow pills, gradient hero, redundant eyebrow+H2+p per section. |
| 9 | Error Recognition and Recovery | 3 | Limited surface; fine. |
| 10 | Help and Documentation | n/a | Persuade surface. |
| **Total** | | **19/32** | **Acceptable (59%)** |

## Design Specificity Verdict

**Not specific** to Review Signal. The landing could be swapped onto any mid-funnel SaaS with only logo and copy edits.

**LLM assessment:** Built in Tailwind CDN with indigo-600, Inter, rounded-3xl cards, Font Awesome icons, gradient-headline cliche. The actual product uses Inter Tight, #4b47e6 accent, --radius: 14px, inline SVGs, tabular numbers, semantic token system (--pos / --neg / --neu / --accent-soft). "Get Started" is a hard-cut into a different product's visual language. The static preview is a generic 4-tile + 3-row-table mockup — none of the real app's load-bearing UI (category sidebar, NPS-impact bars, chip-with-caret cells, segmented sentiment, stars) appears. Two-way sheet sync — the product's actual thesis — is feature card #4 of 4.

**Deterministic scan:** 12 findings across 7 rules (exit code 2).

| Rule | Severity | Count |
|---|---|---|
| ai-color-palette (indigo + violet on headings) | warning | 2 |
| nested-cards | warning | 5 |
| overused-font (Inter) | warning | 1 |
| gradient-text | warning | 1 |
| flat-type-hierarchy | warning | 1 |
| skipped-heading (h2 FAQ → h4) | warning (quality) | 1 |
| em-dash-overuse (8 em-dashes) | advisory | 1 |

Agreement: detector and review converge on the "stock SaaS template" read. Detector caught skipped-heading (real a11y) and em-dash-overuse (AI cadence tell) that the review missed. Likely false positive: flat-type-hierarchy (Tailwind utility classes override element defaults).

**Visual overlays:** not available (no browser automation and no confirmed dev server). CLI JSON findings are the Assessment B signal.

## Overall Impression

Content is largely right (good headline, honest tech strip, FAQ answers real objections) but the visual system is a different product. The handoff from landing → app is a jump cut that kills the "thought-through tool" read a PM is buying. Single biggest opportunity: make the landing a chapter one of the app it sells.

## What's Working

1. Hero headline — "Turn a sheet of reviews into a decision-ready dashboard" is outcome-framed, specific, resists AI-landing fluff.
2. Honest tech strip — refuses to fabricate fake customer logos.
3. FAQ content covers the four real objections (classifier, two-way sync, privacy, try-without-your-data).

## Priority Issues

### [P0] Landing design language is divorced from the product
- Why it matters: Trust in a PM-targeted tool is built on "the product feels thought-through." Two visual systems in two clicks reads as "someone bolted on a landing page." Detector corroborates with ai-color-palette, overused-font, gradient-text, nested-cards.
- Fix: Rebuild landing.html consuming styles.css tokens: real accent (#4b47e6), real radii (14px), Inter Tight, inline SVGs instead of Font Awesome.
- Suggested command: /impeccable adapt

### [P1] The "product preview" doesn't show the product
- Why it matters: The page is trying to transmit "this is what you'll have in 60 seconds" and transmitting a generic SaaS mock instead. PM bounces.
- Fix: Replace the preview with a faithful recreation of the real dashboard (sidebar, NPS-impact bars, chip chevron). Or go harder: live micro-demo — textarea + Classify button → chip appears from the real classifier.
- Suggested command: /impeccable shape

### [P1] Only one CTA label; the sample-dataset path is hidden
- Why it matters: "Get Started" appears four times. The app has a #sampleBtn → "try the sample dataset" path. Landing hides it, forcing a hesitant PM into upload-or-leave. Direct conversion leak.
- Fix: Add a secondary CTA next to every primary one: "See a sample dashboard →". Rename the header primary to something more descriptive ("Classify my reviews" / "Open the app").
- Suggested command: /impeccable clarify

### [P1] Rainbow feature-icon colors collide with the product's semantic palette
- Why it matters: Feature cards use indigo/emerald/violet/rose tiles — one per card. The real app uses color semantically (green=pos, red=neg, amber=neu). Same red signifies "two-way sheet sync" and emerald signifies "sentiment & NPS impact" — collision with trained color meaning.
- Fix: Collapse all four icon backgrounds to a single --accent-soft tile; let the icon shape carry specificity. Reserve pos/neg/neu colors for actual sentiment UI only.
- Suggested command: /impeccable quieter

### [P2] Jargon leak + wrong-audience trust badges + FAQ heading skip
- Why it matters: Hero sub-brand says "Classified by Jev · TypeSafe AI" — three proper nouns, no gloss until FAQ. "Likeliness" and "NPS impact" labels undefined. "Node.js" tech badge aimed at wrong reader. Detector caught h2 → h4 skipped heading in FAQ — breaks screen-reader structure.
- Fix: Drop "Classified by Jev · TypeSafe AI" from hero; keep in Features section. Replace Node.js badge with a buyer signal ("Private — no training" or "Export to CSV"). Add 1-line glosses on Likeliness and NPS impact. Change FAQ question tags from h4 to h3.
- Suggested command: /impeccable clarify

## Persona Red Flags

**Jordan (confused first-timer):** Three org names in the header (Review Signal · Jev · TypeSafe AI) — can't tell which is the product, which is the vendor, whether using one means signing up with another. Answered only in FAQ Q1. Feature card titled "Jev Classification" compounds the confusion by making a feature name identical to a company name.

**Casey (distracted mobile):** On viewports ≤640px, hero stat tiles collapse to a 2×2 of ~160px cards with 10px-uppercase labels — unreadable. Preview table has 4 columns in a tight container; first column wraps, chip column truncates. Mobile sticky header drops the "Get Started" button (hidden sm:inline-flex, line 43) — persistent action rail becomes just a theme toggle.

**Riley (deliberate stress tester):** Flips theme toggle (writes localStorage.theme), clicks Get Started → /app. The app uses its own themeBtn and styles.css relies on [data-theme="dark"] on :root, not Tailwind's html.dark class. Nothing in landing script writes data-theme — dark landing → light app flash. Also: tabbing through hero lands first on theme toggle, not primary CTA. DOM order wrong for keyboard-first.

## Minor Observations

- Flat FAQ (no accordion) inflates page height. Collapse to <details> with first open.
- Footer hover:text-indigo-600 has no dark:hover: variant — hover invisible in dark mode.
- Hardcoded "© 2026 Review Signal" goes stale on 2027-01-01.
- transition-colors duration-300 on <body> causes brief flash on first theme resolve. Suppress initial transition.
- Preview NPS color mapping unexplained — rose on 5, emerald on 1, amber on 4. Explain the magnitude or recolor consistently.
- Decorative radial gradient at line 52 is load-bearing-free vibe halo. Make it a real spotlight or remove.
- Three eyebrow pills ("Powerful Capabilities", "Simple 3-Step Process", "Got Questions?") — replace with one editorial lead-in style.
- Hero's "20 reviews / 30% pos" reads as a toy. Mock realistic volume.
- Font Awesome loads ~100KB CSS for ~10 icons; app ships inline SVG. Replace FA.
- 8 em-dashes in body copy reads as AI cadence. Halve them.

## Questions to Consider

1. If the product's thesis is "upload a sheet, see a classified dashboard," why isn't the hero a live one-review classifier? Textarea + Classify → chip row would be 10 lines, cheaper per visitor than a static mock, and radically more persuasive.
2. What single number would make a PM say "worth 10 minutes"? The page has zero quantitative claim — no volume, no accuracy, no time-savings. One credible number moves this from "aesthetic pitch" to "evidence pitch."
3. If two-way sheet sync is the one thing competitors can't do, why is it feature #4 of 4? Ordering treats the moat as an afterthought. Hero should *show* the sync — animated loop of chip changing in dashboard → cell updating in the Sheet.
