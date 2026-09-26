# Base Power Style Guide

Captured from basepowercompany.com on September 25, 2026 (computed styles and the site's `--bpc-*` CSS custom properties). Everything needed to recreate the look: brand principles, color, type, spacing, radii, shadows, breakpoints and component specs.

## Brand overview

Base Power sells home batteries to Texans, so the site has to feel calm, local and trustworthy rather than techy. The look is warm off-white paper, forest green and a bright lime, big friendly photography with 20px corners, and one plain grotesk doing almost all the talking.

### Voice and copy

- Plain, confident, homeowner-first. Short benefit sentences with a number when there is one: "Get home backup with energy for up to 90% less than a traditional generator."
- Sentence case everywhere, including buttons and headings. No exclamation marks, no emoji.
- Buttons are two or three words, verb first: "Get started", "See your pricing", "Sign in". Secondary actions are TextLinks that start with Explore, Read or Learn.
- Speak to "you" and "your home"; the company is "Base" or "we". Lean on Texas locality ("Built in Austin, TX", town names on testimonials).
- Social proof uses real names and towns: "Bob A. · Waxahachie, TX". Never write placeholder or invented reviews.

### Color

- Page ground is `surface-default` (`grey-5`, #F0EEEB), a warm off-white. Cards, header and rows are `surface-raised` (white). Never use a cool grey ground.
- All text is `text-default` (`grey-100`, #292826), a warm near-black. Secondary copy is `grey-80`. `grey-60` is for captions only and misses AA on `grey-5` below 18px.
- The brand pair is `green-90` forest (#1E4D2B) and `green-20` lime (#B2DD79). Lime is a fill (primary buttons, icon tiles, numbers on dark); forest is text, outlines and the dark section surface. Lime text only goes on `green-90`.
- `surface-dark` sections (forest) take white text and lime accents. That is the only dark treatment on the site.
- Orange (`orange-60`), sky blue (`blue-60`) and goldenrod (`yellow-20`) are illustration and data accents: energy flow, sky and solar, review stars. None of them carry body text on white.
- `red-80` is only for errors; `grid-off` is only the outage state and always ships with an OFF label.
- On site the variables are named `--bpc-color-<name>` (for example `--bpc-color-green-20`, `--bpc-color-brand-primary`), with nicknames terminal, conduit, grounded, livewire, energy, goldenrod, texas-sky and strike.

### Type

- One family does the work: PP Neue Montreal (Pangram Pangram) at 500 for body and 600 for headings and actions, with 0.2px tracking on text 16px and under. Headings run tight (line height 1 to 1.2) and never go above 600.
- Scale: `display-xl` 88 (fluid clamp 48 to 88) for heroes, `heading-md` 32/38.4 for section titles, `heading-sm` 20/27 for card titles, `body-lg` 16/24 for paragraphs, `body-md` 14/21 for card copy, `body-sm` 12/18 weight 600 for labels.
- Two accent faces, used once per section at most: Dahlia Blues (a hand script, `script-eyebrow` 18px) above a section title ("How it works", "Got questions?"), and Clarendon Wide Bold (`display-badge`) for small stamps like "Built in Austin, TX".
- All three are commercial fonts and are not bundled here. License them for production; the previews fall back to Hanken Grotesk, Caveat and Zilla Slab from Google Fonts.

### Layout and spacing

- 4px base scale: `space-1` through `space-32`. Mobile side gutter is `space-4` (16px); cards sit `space-6` (24px) apart; sections breathe with `space-16` on mobile and `space-24` on desktop.
- Content maxes out at `container-max` (1376px), centered.
- Breakpoints follow Tailwind: 640, 768, 1024, 1280. Most layout changes happen at 768.
- The header is sticky at `header-h` (53px); sticky content inside a section sits at `header-h + space-5`.

### Shape, depth and imagery

- `radius-card` (20px) is the house radius for photos and cards. Buttons and small controls use `radius-md` (8px), floating rows `radius-xl` (24px), the pricing sheet `radius-2xl` (32px), toggles and chips `radius-pill`.
- The site is almost flat: separation comes from white on off-white, not shadows. Use `shadow-floating` only for a panel that overlaps other content, and `shadow-media` for media floating over photos.
- Borders are 1px `border-default` (`grey-20`) on neutral controls and 1px `green-90` on outline buttons.
- Photography is warm, sunlit and documentary: real homes, backyards, installers and families, with the battery unit in context. Testimonial photos are black and white under the `scrim` with white text.
- Motion is quiet: 150ms color transitions, 400ms for larger reveals, a 2px chevron nudge on link hover. Respect reduced motion.

### Iconography

- Thin 1.5px line icons in `grey-100` for UI (chevrons, plus, hamburger). Product icons sit in small rounded lime tiles. The source's icon set is inline SVG and is not copied here; match its stroke weight if you redraw.
- The Base logo (an outlined wordmark) is not included. Previews set the name in plain type as a stand-in.

### Accessibility notes

- Primary buttons pass at 6.3:1 (forest on lime). Forest on white is 9.8:1, near-black on off-white 12.7:1.
- `grey-60` on `grey-5` is 3.5:1 and `orange-60` on white is 3.1:1: both are source values kept as-is, so hold them to large text or decoration.
- Focus: a 2px `grey-100` outline with 2px offset on every control.

## Color tokens

On the site each token is `--bpc-color-<name>`.

### Base palette

| Token | Hex | Usage |
| --- | --- | --- |
| `grey-100` | `#292826` | Darkest neutral (site name: terminal). Default text and headings on grey-5 (12.7:1) and white (14.7:1). |
| `grey-80` | `#54524f` | Secondary body text and strong borders, on grey-5 (6.7:1) and white. |
| `grey-60` | `#7f7d7a` | Muted captions and metadata. 4.1:1 on white, only 3.5:1 on grey-5: the source uses it below AA there, so keep it to 18px+ or white grounds. |
| `grey-40` | `#a9a8a7` | Disabled text and placeholder icons. Decorative only (2.4:1 on white). |
| `grey-20` | `#d8d7d5` | Default hairline borders (inputs, carousel arrows, card outlines) and the subtle surface. |
| `grey-5` | `#f0eeeb` | Warm off-white page background (site name: conduit). The ground almost everything sits on. |
| `white` | `#ffffff` | Raised cards, the sticky header, testimonial and accordion rows (site name: strike). |
| `green-100` | `#102a17` | Deepest green. Pressed/active state of the primary button. |
| `green-90` | `#1e4d2b` | Forest green (site name: grounded). Brand text, links, outline buttons, and the dark section surface. 9.8:1 on white, 8.4:1 on grey-5. |
| `green-60` | `#77a45a` | Mid green. Hover fill for the primary button. |
| `green-20` | `#b2dd79` | Lime (site name: livewire). The primary brand color: primary button fill with green-90 text (6.3:1), step numbers and links on green-90. |
| `green-5` | `#d6f0b4` | Pale lime. Subtle brand tints, selected chips, highlight backgrounds. |
| `orange-90` | `#742c0b` | Deep rust. Text on orange-5. |
| `orange-60` | `#ed6c30` | Energy orange (site name: energy). Illustrations, energy-flow graphics, accents. Not for text on white (3.1:1). |
| `orange-40` | `#f09064` | Soft orange. Secondary illustration fills. |
| `orange-5` | `#fbe3d8` | Orange tint. Background for energy callouts. |
| `blue-100` | `#07314b` | Deep navy. Text on blue-10. |
| `blue-80` | `#06507e` | Dark blue. Links or text on light blue grounds. |
| `blue-60` | `#048ee5` | Texas sky (site name: texas-sky). Diagram and map accents. |
| `blue-40` | `#68baed` | Light sky. Secondary diagram fills. |
| `blue-10` | `#cce5f5` | Sky tint. Informational backgrounds. |
| `yellow-80` | `#5e4507` | Dark gold. Text on yellow-5. |
| `yellow-60` | `#aa8422` | Ochre. Icons on light gold grounds. |
| `yellow-20` | `#f7c33c` | Goldenrod (site name: goldenrod). Review stars and sun/solar accents. Never text (1.6:1 on white). |
| `yellow-10` | `#f9d77d` | Light gold. Secondary star/solar fills. |
| `yellow-5` | `#fdf1d3` | Gold tint. Highlight backgrounds. |
| `red-80` | `#c51808` | Error text and borders (6.0:1 on white). |
| `red-20` | `#ff948a` | Soft red. Error illustration fills. |
| `red-5` | `#ffccc7` | Error tint background. |
| `grid-off` | `#bf5249` | Grid-down state in the outage simulator (GridON/OFF toggle). |
| `timeline-active` | `#084d41` | Active step in timelines. |
| `timeline-inactive` | `#cdd3cf` | Inactive step and track in timelines. |
| `scrim` | `rgba(0,0,0,0.55)` | Photo overlay behind white text on image cards and testimonials. |

### Semantic aliases

| Token | Points to | Resolved | Usage |
| --- | --- | --- | --- |
| `brand-primary` | `green-20` | `#b2dd79` | Primary CTA fill ("Get started", "See your pricing"). |
| `brand-primary-foreground` | `green-90` | `#1e4d2b` | Text and icons on brand-primary. |
| `brand-primary-hover` | `green-60` | `#77a45a` | Primary CTA hover fill. |
| `brand-primary-active` | `green-100` | `#102a17` | Primary CTA pressed fill. |
| `brand-primary-subtle` | `green-5` | `#d6f0b4` | Subtle brand-tinted background. |
| `text-default` | `grey-100` | `#292826` | Body and heading text on surface-default and surface-raised. |
| `text-muted` | `grey-60` | `#7f7d7a` | Captions and metadata; see grey-60's contrast note. |
| `text-disabled` | `grey-40` | `#a9a8a7` | Disabled labels. |
| `text-brand` | `green-90` | `#1e4d2b` | Brand-voiced text and links ("Explore Backup Only"). |
| `text-inverse` | `white` | `#ffffff` | Text on surface-dark and on photos with scrim. |
| `text-error` | `red-80` | `#c51808` | Error messages. |
| `surface-default` | `grey-5` | `#f0eeeb` | Page background. |
| `surface-raised` | `white` | `#ffffff` | Cards, header, accordion rows. |
| `surface-subtle` | `grey-20` | `#d8d7d5` | Wells, skeletons, inactive tracks. |
| `surface-dark` | `green-90` | `#1e4d2b` | Dark feature sections, active step card, pricing panel. |
| `border-default` | `grey-20` | `#d8d7d5` | Card and control outlines. |
| `border-strong` | `grey-80` | `#54524f` | Emphasized dividers. |
| `border-active` | `grey-100` | `#292826` | Focused inputs and selected options. |
| `border-error` | `red-80` | `#c51808` | Invalid field outline. |

## Typography

### Font families

| Role | Stack |
| --- | --- |
| sans | `"PP Neue Montreal", "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` |
| display | `"Clarendon Wide", "Zilla Slab", "PP Neue Montreal", Georgia, serif` |
| script | `"Dahlia Blues", "Caveat", cursive` |
| mono | `"SF Mono", Monaco, Consolas, "Liberation Mono", monospace` |

PP Neue Montreal, Clarendon Wide and Dahlia Blues are commercial fonts. License them for production; Hanken Grotesk, Zilla Slab and Caveat (Google Fonts) are the stand-ins.

### Type scale

| Style | Family | Size | Line height | Weight | Tracking | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `display-xl` | sans | 88px | 1 | 600 | -0.02em | Hero headline. On site: clamp(3rem, 5.6vw, 5.5rem). |
| `display-lg` | sans | 68px | 1 | 600 | -0.02em | Section hero. clamp(3rem, 4.7vw, 4.25rem). |
| `display-md` | sans | 44px | 1.2 | 600 | normal |  |
| `display-sm` | sans | 30px | 1.2 | 600 | normal |  |
| `heading-xl` | sans | 48px | 1.2 | 600 | normal |  |
| `heading-lg` | sans | 40px | 1.1 | 600 | normal | Page H1 at tablet/mobile (40/44). |
| `heading-md` | sans | 32px | 1.2 | 600 | normal | Section H2: "Trusted by 30,000+ homeowners". |
| `heading-sm` | sans | 20px | 1.35 | 600 | normal | Card titles, accordion rows, quote text. |
| `body-lg` | sans | 16px | 1.5 | 500 | 0.2px | Default paragraph. |
| `body-lg-strong` | sans | 16px | 1.5 | 600 | 0.2px | Large buttons and links. |
| `body-md` | sans | 14px | 1.5 | 500 | 0.2px | Card body and nav. |
| `body-md-strong` | sans | 14px | 1.5 | 600 | 0.2px | Header buttons, inline links. |
| `body-sm` | sans | 12px | 1.5 | 600 | 0.2px | Labels, step numbers, tags. |
| `body-xs` | sans | 11px | 1.5 | 400 | 0.2px | Legal and footnotes. |
| `script-eyebrow` | script | 18px | 1 | 400 | normal | Hand-lettered eyebrow above a section title ("How it works", "Got questions?"). |
| `display-badge` | display | 12px | 1.2 | 700 | normal | Clarendon Wide stamp, e.g. "Built in Austin, TX". |

## Spacing and layout

| Token | Value | Usage |
| --- | --- | --- |
| `space-1` | `4px` | Icon-to-text nudges. |
| `space-2` | `8px` | Tight gaps, button vertical padding (small). |
| `space-3` | `12px` | Small button horizontal padding, chip gaps. |
| `space-4` | `16px` | Page side gutter on mobile, card inner padding (small). |
| `space-5` | `20px` | Accordion row padding; sticky offset below header. |
| `space-6` | `24px` | Card inner padding, gap between cards (section-gap). |
| `space-8` | `32px` | Stack gap inside sections. |
| `space-10` | `40px` | Heading to content. |
| `space-12` | `48px` | Small section padding. |
| `space-16` | `64px` | Section padding on mobile. |
| `space-20` | `80px` | Section padding on tablet. |
| `space-24` | `96px` | Section padding on desktop. |
| `space-32` | `128px` | Hero padding on desktop. |
| `header-h` | `53px` | Sticky header height. |
| `container-max` | `1376px` | Max content width, centered. |

## Corner radius

| Token | Value | Usage |
| --- | --- | --- |
| `radius-sm` | `4px` | Tags, small inputs. |
| `radius-md` | `8px` | Buttons, icon buttons, inputs. |
| `radius-lg` | `16px` | Inner media, small cards. |
| `radius-card` | `20px` | The house card radius: product images, step cards, testimonials. Most used radius on the site. |
| `radius-xl` | `24px` | Accordion rows and floating panels. |
| `radius-2xl` | `32px` | Pricing panel and large overlays. |
| `radius-pill` | `9999px` | Toggle pills, hamburger button, badges. |

## Shadows

| Token | Value | Usage |
| --- | --- | --- |
| `shadow-media` | `0 8px 24px rgba(0,0,0,0.35)` | Floating media over photos. |
| `shadow-floating` | `0 18px 48px rgba(0,0,0,0.45)` | Modal-like panels (pricing sheet). |
| `text-shadow-media` | `0 2px 10px rgba(0,0,0,0.45)` | White text over photography. |

## Breakpoints and motion

| Name | Min width |
| --- | --- |
| sm | 640px |
| md | 768px (main layout switch) |
| lg | 1024px |
| xl | 1280px |

Transitions: 150ms `cubic-bezier(.4,0,.2,1)` for color and border changes, 400ms ease for larger reveals. Honor `prefers-reduced-motion`.

## Components

### Header

Sticky, white, `header-h` (53px) tall, 16px side padding, no border or shadow. Logo left; right side holds Sign in (outline), Get started (primary) and a ghost hamburger, 8px apart. Sections that stick below it use `top: header-h + space-5`.

The preview sets the wordmark in plain type as a stand-in: the real Base logo (an outlined wordmark) is not included in this system. Get it from the brand owner.

Consumer provides: the logo asset and the menu contents.

Reference markup:

```html
<div class="bp-header"><span class="bp-header-wordmark">BASE</span><div class="bp-header-actions"><a class="bp-btn bp-btn-outline" href="#">Sign in</a><a class="bp-btn bp-btn-primary" href="#">Get started</a><button class="bp-icon-btn bp-icon-btn-ghost" aria-label="Menu"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h16M3 11h16M3 16h16"/></svg></button></div></div>
```

### Button

Two sizes and three styles, all with 8px corners (`radius-md`) and weight 600 labels. Sentence case, two or three words, verb first: "Get started", "See your pricing", "Sign in".

- Primary (`bp-btn-primary`): `brand-primary` lime fill with `brand-primary-foreground` forest text (6.3:1). Hover `brand-primary-hover`, pressed `brand-primary-active` with white text. One primary per view region; the header always carries one.
- Outline (`bp-btn-outline`): transparent with a 1px `green-90` border and `green-90` text. Pairs with a primary ("Sign in" next to "Get started").
- Inverse (`bp-btn-inverse`): 1px white border and white text, only on `surface-dark` or on photos with the scrim.
- Small: 14/21, padding 8px 12px, 44px tall (header). Large (`bp-btn-lg`): 16/24, padding 12px 16px, 48 to 50px tall (page CTAs).

Consumer provides: the label and an `href` or click handler. No icons inside buttons; chevrons belong to text links.

Reference markup:

```html
<div class="bp-row"><a class="bp-btn bp-btn-primary" href="#">Get started</a><a class="bp-btn bp-btn-outline" href="#">Sign in</a><a class="bp-btn bp-btn-primary bp-btn-lg" href="#">See your pricing</a><a class="bp-btn bp-btn-outline bp-btn-lg" href="#">Explore Base in my area</a></div>
<div class="bp-row" style="background:var(--surface-dark)"><a class="bp-btn bp-btn-inverse bp-btn-lg" href="#">Learn more</a><a class="bp-btn bp-btn-primary bp-btn-lg" href="#">Get started</a></div>
```

### TextLink

The site's secondary call to action: a 14px weight-600 link in `text-brand` followed by a small right chevron that nudges 2px on hover. No underline.

Use under a card's description ("Explore Backup Only") and inside testimonials ("Read Bob's story"). On `surface-dark` or photos, switch to `bp-link-on-dark` (`green-20`).

Consumer provides: the label (starts with a verb: Explore, Read, Learn) and the `href`.

Reference markup:

```html
<div class="bp-row"><a class="bp-link" href="#">Explore Energy + Backup</a><a class="bp-link" href="#">Explore Backup Only</a></div>
<div class="bp-row" style="background:var(--surface-dark)"><a class="bp-link bp-link-on-dark" href="#">Read Bob's story</a></div>
```

### IconButton

A 44 by 44 square control. Bordered variant: white fill, 1px `border-default`, `radius-md`, used in pairs for carousel previous/next, centered under the track with an 12px gap. Ghost variant (`bp-icon-btn-ghost`): no border, `radius-pill`, used for the header hamburger.

Consumer provides: the icon (1.5px stroke line icons, `grey-100`) and an `aria-label`.

Reference markup:

```html
<div class="bp-row"><button class="bp-icon-btn" aria-label="Previous"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3 5 8l5 5"/></svg></button><button class="bp-icon-btn" aria-label="Next"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 3 5 5-5 5"/></svg></button><button class="bp-icon-btn bp-icon-btn-ghost" aria-label="Menu"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h16M3 11h16M3 16h16"/></svg></button></div>
```

### ProductCard

The homepage product pattern: a full-bleed lifestyle photo with `radius-card` corners, then a 32px weight-600 title led by a 28px rounded lime icon tile, a one-sentence `body-md` description, and a TextLink. No card background: it sits on `surface-default`. Stack gaps are 16px.

Consumer provides: the photo (warm, natural light, real Texas homes and people), the product name, one sentence of benefit copy, and the link.

Reference markup:

```html
<div class="bp-stack"><div class="bp-product"><div class="bp-media">Product photo · 20px corners</div><h3 class="bp-product-title"><span class="bp-product-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M9 1 3 9h4l-1 6 6-8H8l1-6z"/></svg></span>Backup + Energy</h3><p>Get home backup with energy for up to 90% less than a traditional generator.</p><a class="bp-link" href="#">Explore Energy + Backup</a></div></div>
```

### StepCard

A numbered process step for "How it works". Cards stack with 12px gaps; the current step expands on `surface-dark` with white text, a `green-20` number and a `radius-lg` photo, the rest stay collapsed on white. Padding 24px, corners `radius-card`.

The numbers are a real sequence (01, 02, 03), so keep them two digits in `body-sm`. Introduce the stack with a script eyebrow ("How it works").

Consumer provides: step number, title, body and photo for each step, and which one is open.

Reference markup:

```html
<div class="bp-stack"><div class="bp-step is-active"><span class="bp-step-num">01</span><h3 class="bp-step-title">Snap a few pictures</h3><p>Send a few photos of your home. Our engineers will determine which Base battery configuration is best for you.</p><div class="bp-media" style="aspect-ratio:16/6;background:var(--green-100);color:var(--green-20)">Photo</div></div><div class="bp-step"><span class="bp-step-num">02</span><h3 class="bp-step-title">Sit back and relax</h3></div></div>
```

### TestimonialCard

Two variants in one horizontal carousel (cards about 400px wide, 24px gaps, IconButton pair below).

- Photo: a black-and-white customer photo under the `scrim`, quote in `heading-sm` white with `text-shadow-media`, name and town in 14px, a `bp-link-on-dark` story link.
- Review: white card, five `yellow-20` stars, the review in `body-lg` truncated with an ellipsis, reviewer name with a small Google mark.

Both use `radius-card` and 32px padding. Precede the carousel with a `heading-md` claim plus the rating ("4.8 stars" and stars).

Consumer provides: real customer quotes with name and town. Never invent reviews.

Reference markup:

```html
<div class="bp-row" style="align-items:stretch"><div class="bp-quote bp-quote-photo" style="flex:1 1 260px"><blockquote>"I was ready to go and get the biggest, loudest generator I could possibly find. Then I found Base."</blockquote><span class="bp-quote-meta">Bob A. · Waxahachie, TX</span><a class="bp-link bp-link-on-dark" href="#">Read Bob's story</a></div><div class="bp-quote bp-quote-plain" style="flex:1 1 220px"><span class="bp-stars">★★★★★</span><blockquote>"I have been in the area for a while. My power outages are rare, but enough..."</blockquote><span class="bp-quote-meta">Bill P. · Google review</span></div></div>
```

### AccordionRow

A white pill-ish row (`radius-xl`, 20px padding) with a `heading-sm` label and a thin plus that rotates to an x when open. On the site these float 12px inside the bottom of a full-bleed photo card; in FAQ lists they stack with 12px gaps on `surface-default`.

Consumer provides: the question or feature name and the answer content.

Reference markup:

```html
<div class="bp-stack"><details class="bp-acc"><summary>Compatible with solar systems</summary></details><details class="bp-acc" open><summary>Works in any outage</summary><div class="bp-acc-body">Base switches your home over automatically when the grid goes down.</div></details></div>
```

### TogglePill

The outage simulator switch: a `grey-5` pill (`radius-pill`, 68px tall on site) holding the label and a 52 by 32 track. On uses `green-60`, off uses `grid-off`. Always pair the color change with the ON/OFF word so the state never relies on red versus green alone.

Consumer provides: `aria-pressed` state and the change handler.

Reference markup:

```html
<div class="bp-row"><button class="bp-toggle" aria-pressed="true">Grid<b>ON</b><span class="bp-toggle-track"></span></button><button class="bp-toggle" aria-pressed="false">Grid<b>OFF</b><span class="bp-toggle-track"></span></button></div>
```

### PricingPanel

A centered `surface-dark` panel with `radius-2xl` corners and `shadow-floating` that rises over the plans section. Stack: an outlined lime icon, `heading-md` white title, one line of 85% white body, then a large primary button. Padding 40px by 32px.

Consumer provides: the title, one sentence, and the CTA.

Reference markup:

```html
<div class="bp-stack" style="padding:24px"><div class="bp-panel"><span class="bp-panel-icon">$</span><h3>See pricing for your home</h3><p>Select your utility provider to view plans available in your area.</p><a class="bp-btn bp-btn-primary bp-btn-lg" href="#">See your pricing</a></div></div>
```

## CSS starter

Drop-in variables, then the component classes used in the markup above.

```css
:root {
  --grey-100: #292826;
  --grey-80: #54524f;
  --grey-60: #7f7d7a;
  --grey-40: #a9a8a7;
  --grey-20: #d8d7d5;
  --grey-5: #f0eeeb;
  --white: #ffffff;
  --green-100: #102a17;
  --green-90: #1e4d2b;
  --green-60: #77a45a;
  --green-20: #b2dd79;
  --green-5: #d6f0b4;
  --orange-90: #742c0b;
  --orange-60: #ed6c30;
  --orange-40: #f09064;
  --orange-5: #fbe3d8;
  --blue-100: #07314b;
  --blue-80: #06507e;
  --blue-60: #048ee5;
  --blue-40: #68baed;
  --blue-10: #cce5f5;
  --yellow-80: #5e4507;
  --yellow-60: #aa8422;
  --yellow-20: #f7c33c;
  --yellow-10: #f9d77d;
  --yellow-5: #fdf1d3;
  --red-80: #c51808;
  --red-20: #ff948a;
  --red-5: #ffccc7;
  --grid-off: #bf5249;
  --timeline-active: #084d41;
  --timeline-inactive: #cdd3cf;
  --scrim: rgba(0,0,0,0.55);
  --brand-primary: var(--green-20);
  --brand-primary-foreground: var(--green-90);
  --brand-primary-hover: var(--green-60);
  --brand-primary-active: var(--green-100);
  --brand-primary-subtle: var(--green-5);
  --text-default: var(--grey-100);
  --text-muted: var(--grey-60);
  --text-disabled: var(--grey-40);
  --text-brand: var(--green-90);
  --text-inverse: var(--white);
  --text-error: var(--red-80);
  --surface-default: var(--grey-5);
  --surface-raised: var(--white);
  --surface-subtle: var(--grey-20);
  --surface-dark: var(--green-90);
  --border-default: var(--grey-20);
  --border-strong: var(--grey-80);
  --border-active: var(--grey-100);
  --border-error: var(--red-80);
  --font-sans: "PP Neue Montreal", "Hanken Grotesk", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: "Clarendon Wide", "Zilla Slab", "PP Neue Montreal", Georgia, serif;
  --font-script: "Dahlia Blues", "Caveat", cursive;
  --font-mono: "SF Mono", Monaco, Consolas, "Liberation Mono", monospace;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;
  --space-32: 128px;
  --header-h: 53px;
  --container-max: 1376px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-card: 20px;
  --radius-xl: 24px;
  --radius-2xl: 32px;
  --radius-pill: 9999px;
  --shadow-media: 0 8px 24px rgba(0,0,0,0.35);
  --shadow-floating: 0 18px 48px rgba(0,0,0,0.45);
  --text-shadow-media: 0 2px 10px rgba(0,0,0,0.45);
}

/* Components */
@import url("https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&family=Caveat:wght@400&family=Zilla+Slab:wght@700&display=swap");
body { margin: 0; font-family: var(--font-sans); background: var(--surface-default); color: var(--text-default); font-size: 16px; line-height: 1.5; font-weight: 500; letter-spacing: .2px; -webkit-font-smoothing: antialiased; }
.bp-row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; padding: var(--space-4); }
.bp-stack { display: grid; gap: var(--space-4); padding: var(--space-4); }

/* Button */
.bp-btn { font: inherit; font-weight: 600; font-size: 14px; line-height: 21px; letter-spacing: .2px; display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-3); min-height: 44px; box-sizing: border-box; border-radius: var(--radius-md); border: 1px solid transparent; cursor: pointer; text-decoration: none; transition: background-color .15s cubic-bezier(.4,0,.2,1), color .15s cubic-bezier(.4,0,.2,1), border-color .15s cubic-bezier(.4,0,.2,1); }
.bp-btn-lg { font-size: 16px; line-height: 24px; padding: var(--space-3) var(--space-4); min-height: 48px; }
.bp-btn-primary { background: var(--brand-primary); color: var(--brand-primary-foreground); }
.bp-btn-primary:hover { background: var(--brand-primary-hover); }
.bp-btn-primary:active { background: var(--brand-primary-active); color: var(--white); }
.bp-btn-outline { background: transparent; color: var(--green-90); border-color: var(--green-90); }
.bp-btn-outline:hover { background: var(--green-5); }
.bp-btn-inverse { background: transparent; color: var(--white); border-color: var(--white); }
.bp-btn-inverse:hover { background: rgba(255,255,255,.12); }
.bp-btn:focus-visible, .bp-icon-btn:focus-visible, .bp-link:focus-visible, .bp-acc summary:focus-visible, .bp-toggle:focus-visible { outline: 2px solid var(--grey-100); outline-offset: 2px; }

/* Text link with chevron */
.bp-link { font-weight: 600; font-size: 14px; line-height: 21px; color: var(--text-brand); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.bp-link::after { content: ""; width: 6px; height: 6px; border-right: 1.5px solid currentColor; border-top: 1.5px solid currentColor; transform: rotate(45deg); transition: transform .15s ease; }
.bp-link:hover::after { transform: translateX(2px) rotate(45deg); }
.bp-link-on-dark { color: var(--green-20); }

/* Icon button */
.bp-icon-btn { width: 44px; height: 44px; display: inline-grid; place-items: center; background: var(--white); color: var(--grey-100); border: 1px solid var(--grey-20); border-radius: var(--radius-md); cursor: pointer; }
.bp-icon-btn:hover { border-color: var(--grey-80); }
.bp-icon-btn-ghost { border-color: transparent; background: transparent; border-radius: var(--radius-pill); }

/* Header */
.bp-header { height: var(--header-h); background: var(--white); display: flex; align-items: center; justify-content: space-between; padding: 0 var(--space-4); box-sizing: border-box; }
.bp-header-wordmark { font-weight: 700; font-size: 18px; letter-spacing: .02em; color: var(--grey-100); }
.bp-header-actions { display: flex; gap: var(--space-2); align-items: center; }

/* Product card */
.bp-product { display: grid; gap: var(--space-4); }
.bp-media { background: var(--grey-20); border-radius: var(--radius-card); aspect-ratio: 16/10; max-width: 100%; display: grid; place-items: center; color: var(--grey-60); font-size: 12px; font-weight: 600; }
.bp-product-title { display: flex; align-items: center; gap: var(--space-3); margin: 0; font-size: 32px; line-height: 1.2; font-weight: 600; }
.bp-product-icon { width: 28px; height: 28px; border-radius: 8px; background: var(--green-20); color: var(--green-90); display: grid; place-items: center; }
.bp-product p { margin: 0; font-size: 14px; line-height: 21px; }

/* Step card */
.bp-step { background: var(--white); border-radius: var(--radius-card); padding: var(--space-6); display: grid; gap: var(--space-3); }
.bp-step-num { font-size: 12px; line-height: 18px; font-weight: 600; color: var(--grey-60); }
.bp-step-title { margin: 0; font-size: 20px; line-height: 27px; font-weight: 600; }
.bp-step p { margin: 0; }
.bp-step.is-active { background: var(--surface-dark); color: var(--white); }
.bp-step.is-active .bp-step-num { color: var(--green-20); }

/* Testimonial */
.bp-quote { border-radius: var(--radius-card); padding: var(--space-8); display: grid; gap: var(--space-4); align-content: start; }
.bp-quote-photo { background: var(--grey-80); color: var(--white); }
.bp-quote-plain { background: var(--white); }
.bp-quote blockquote { margin: 0; font-size: 20px; line-height: 27px; font-weight: 600; }
.bp-quote-plain blockquote { font-size: 16px; line-height: 24px; font-weight: 500; }
.bp-quote-meta { font-size: 14px; line-height: 21px; opacity: .85; }
.bp-stars { color: var(--yellow-20); letter-spacing: 4px; font-size: 18px; }

/* Accordion row */
.bp-acc { background: var(--white); border-radius: var(--radius-xl); }
.bp-acc summary { list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; padding: var(--space-5); font-size: 20px; line-height: 27px; font-weight: 600; }
.bp-acc summary::-webkit-details-marker { display: none; }
.bp-acc summary::after { content: "+"; font-weight: 400; font-size: 28px; line-height: 1; transition: transform .15s ease; }
.bp-acc[open] summary::after { transform: rotate(45deg); }
.bp-acc-body { padding: 0 var(--space-5) var(--space-5); color: var(--grey-80); }

/* Toggle pill */
.bp-toggle { display: inline-flex; align-items: center; gap: var(--space-3); background: var(--grey-5); color: var(--grey-100); border-radius: var(--radius-pill); padding: var(--space-3); padding-left: var(--space-5); font: inherit; font-weight: 400; border: 0; cursor: pointer; }
.bp-toggle-track { width: 52px; height: 32px; border-radius: var(--radius-pill); background: var(--green-60); position: relative; }
.bp-toggle-track::after { content: ""; position: absolute; top: 4px; left: 24px; width: 24px; height: 24px; border-radius: 50%; background: var(--white); transition: left .15s ease; }
.bp-toggle[aria-pressed="false"] .bp-toggle-track { background: var(--grid-off); }
.bp-toggle[aria-pressed="false"] .bp-toggle-track::after { left: 4px; }

/* Pricing panel */
.bp-panel { background: var(--surface-dark); color: var(--white); border-radius: var(--radius-2xl); padding: var(--space-10) var(--space-8); text-align: center; display: grid; gap: var(--space-4); justify-items: center; box-shadow: var(--shadow-floating); }
.bp-panel h3 { margin: 0; font-size: 32px; line-height: 1.2; font-weight: 600; }
.bp-panel p { margin: 0; max-width: 32ch; color: rgba(255,255,255,.85); }
.bp-panel-icon { width: 32px; height: 32px; border: 2px solid var(--green-20); border-radius: 8px; color: var(--green-20); display: grid; place-items: center; font-weight: 700; }

/* Eyebrow + stamp */
.bp-eyebrow { font-family: var(--font-script); font-size: 18px; line-height: 1; color: var(--green-90); }
.bp-stamp { font-family: var(--font-display); font-weight: 700; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; color: var(--grey-100); }
```
