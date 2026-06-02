# Product

## Register

product

## Users
South African online shoppers who hunt deals, especially around Black Friday. They are
price-savvy and sceptical of inflated "was/now" markdowns. Context of use: checking in
repeatedly (daily, or several times a day during a sale window) on a watchlist of
products they have pasted in from supported SA retailers (Takealot, Wootware, Evetech,
iStore, Loot, etc.). The job to be done: *"Tell me whether the current price is a real
discount against what this product normally costs, and surface the moment a genuine drop
lands, so I act on real deals and ignore fake ones."*

Primary screen task: scan a dense watchlist, immediately spot which items have actually
dropped and by how much, and add a new product URL to track. Secondary: drill into one
product's price history; manage per-item public/private visibility; (admin) settings.

## Product Purpose
DealRadar tracks prices on SA retailer product pages and scores each current price
against a rolling 90-day **median** baseline (not the all-time high, not the retailer's
"was" price). It assigns a deal tier (modest / good / exceptional) and flags Black-Friday
drops, so the signal a user sees is the *quality of the discount*, not marketing noise.
Success = a user trusts the score enough to buy on an "exceptional" and to ignore a
fake-looking "30% off" that the baseline says is flat.

## Brand Personality
Precise, trustworthy, unhurried. Three words: **honest, sharp, calm.** The product's
credibility comes from showing real numbers plainly: the figure is the hero, the chrome
recedes. Voice is specific and factual ("R2 500 off, 31% below the 90-day median"), never
hype. It should feel like an instrument you check, not a store that sells to you.

## Anti-references
- **Generic SaaS dashboard** — no purple-on-white gradients, no hero-metric template
  (big number + tiny label + gradient accent), no identical icon-heading-text card grids.
- **Loud coupon / deal site** — no red blinking banners, countdown-pressure timers,
  starbursts, "BUY NOW" urgency spam, or stock-scarcity manipulation. Urgency, when it
  exists, is earned by the data (a real drop), never manufactured by the UI.

## Design Principles
1. **The number is the subject.** Prices, drops and savings get the strongest typographic
   voice (tabular mono, the single accent). Everything else is structure that frames them.
2. **One reserved signal.** A single acid-lime accent means "this is a real drop" and is
   used nowhere else. Scarcity of colour = trust; a page that shouts everywhere says
   nothing.
3. **Derive, never decorate.** Every label (tier, percent, rands saved) computes from the
   price data against shared thresholds, so the UI can never claim a deal the data doesn't
   support. Honesty is structural, not cosmetic.
4. **Dense but scannable.** Repeat-use tool: reward the returning user with information
   density and a clear at-a-glance hierarchy (summary → best drop → full list), not
   onboarding fluff.
5. **Calm by default, sharp on signal.** Restrained greyscale base; motion and colour
   appear only to mark something that genuinely changed.

## Accessibility & Inclusion
- Target **WCAG 2.2 AA**: body text ≥4.5:1, large/figures ≥3:1, visible focus rings on
  every interactive control (the accent doubles as the focus colour).
- **Do not encode deal quality by colour alone** — the lime drop figure is always paired
  with a text tier label and a "↓ X%" value, so colour-blind users get the same signal.
- Full `prefers-reduced-motion` support: the page-load cascade, row stagger, and radar
  ping all collapse to instant/!important-disabled under reduce.
- Tabular numerals so figures align and scan vertically; thin non-breaking thousands
  separators keep rands readable without commas fighting the mono grid.
