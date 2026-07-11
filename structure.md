src/
pages/
Landing.jsx
Login.jsx
components/
layout/
NavBar.jsx
Footer.jsx
sections/ # landing page is really 6 stacked sections
Hero.jsx
HowItWorks.jsx
TrustBand.jsx
NfcSection.jsx
Pricing.jsx
FinalCta.jsx
ui/ # shadcn-managed, don't hand-edit much
button.jsx (exists)
input.jsx (to add)
card.jsx (to add)
verification-badge/
VerificationBadge.jsx # the tiered seal component — used in Hero, TrustBand, profile cards
lib/
utils.js (exists)
App.jsx # becomes just the router

Step 1 — Install & wire up react-router-dom
Concept: client-side routing, <BrowserRouter>, <Routes>/<Route>, why App.jsx becomes a router shell instead of holding page content.
You do: npm install react-router-dom, rewrite main.jsx/App.jsx to define two empty placeholder routes (/ and /login).

Step 2 — Build the VerificationBadge component first
Concept: props, variants (tier: registered/verified/trusted), size variants (inline/profile/hero), and why we build this in isolation before the pages that use it — it appears in the hero, the trust band, and eventually every profile card.
You do: create components/verification-badge/VerificationBadge.jsx, port the 3-tier/3-size logic from ABRI_design_system.html's .vbadge/.mark CSS using Tailwind classes + a cva variant map (same pattern as button.jsx).

Step 3 — Layout shell: NavBar + Footer
Concept: composition — App.jsx/a Layout wrapping every page so nav/footer aren't duplicated. Introduces <Link> from react-router for internal navigation (vs. plain <a>).
You do: build both from the landing page's nav/footer markup.

Step 4 — Landing page, section by section
We go in this order (simplest → most complex), each as its own component file, then assembled in pages/Landing.jsx:

1. Hero.jsx (headline, CTAs, the profile-card preview using VerificationBadge)
2. HowItWorks.jsx (3-step grid — good repetition/.map() exercise)
3. TrustBand.jsx (tier cards + vouching copy — reuses VerificationBadge again)
4. NfcSection.jsx
5. Pricing.jsx
6. FinalCta.jsx

Step 5 — Login page
Concept: controlled form inputs, useState for form state, basic client-side validation (mirroring the patterns in ABRI_register.html's step-1 validation). We design this page from scratch using the register page's card/shell as the visual template, since no login mockup exists.
You do: build pages/Login.jsx using an Input shadcn component (we'll npx shadcn add input first) + the Button you already have.

Step 6 — Polish pass
Dark mode toggle wiring (the dark class logic already sketched in the starter App.jsx), responsive check, and cleaning up unused starter files (App.css, react.svg, vite.svg, the counter demo).
