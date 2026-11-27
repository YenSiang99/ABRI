import { Router } from "express";

import { prisma } from "../prisma.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();
const SITEMAP_PAGE_SIZE = 45_000;
const STATIC_PATHS = ["/", "/directory", "/about", "/contact", "/faq", "/ask", "/privacy", "/terms"];

function siteOrigin() {
  const configured = process.env.PUBLIC_SITE_URL || "https://abri.asia";
  try {
    return new URL(configured).origin;
  } catch {
    return "https://abri.asia";
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value = "") {
  return escapeHtml(value);
}

function jsonForHtml(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function xmlResponse(res) {
  return res.type("application/xml").set({
    "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
  });
}

function urlSet(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => {
    const lastmod = entry.lastmod ? `\n  <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
    return ` <url>\n  <loc>${escapeXml(entry.loc)}</loc>${lastmod}\n  <changefreq>${entry.changefreq || "weekly"}</changefreq>\n </url>`;
  }).join("\n")}\n</urlset>`;
}

router.get("/sitemap.xml", asyncHandler(async (_req, res) => {
  const origin = siteOrigin();
  const businessCount = await prisma.business.count();
  const pages = Math.max(1, Math.ceil(businessCount / SITEMAP_PAGE_SIZE));
  const sitemaps = [
    `${origin}/sitemaps/static.xml`,
    ...Array.from({ length: pages }, (_, index) => `${origin}/sitemaps/businesses-${index + 1}.xml`),
  ];
  xmlResponse(res).send(`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.map((loc) => ` <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join("\n")}\n</sitemapindex>`);
}));

router.get("/sitemaps/static.xml", (_req, res) => {
  const origin = siteOrigin();
  xmlResponse(res).send(urlSet(STATIC_PATHS.map((path) => ({ loc: `${origin}${path}`, changefreq: path === "/directory" ? "daily" : "monthly" }))));
});

router.get("/sitemaps/businesses-:page.xml", asyncHandler(async (req, res) => {
  const page = Number.parseInt(req.params.page, 10);
  if (!Number.isInteger(page) || page < 1) return res.status(400).send("Invalid sitemap page.");

  const businesses = await prisma.business.findMany({
    select: { id: true, updatedAt: true },
    orderBy: { id: "asc" },
    skip: (page - 1) * SITEMAP_PAGE_SIZE,
    take: SITEMAP_PAGE_SIZE,
  });
  if (!businesses.length) return res.status(404).send("Sitemap page not found.");

  const origin = siteOrigin();
  return xmlResponse(res).send(urlSet(businesses.map((business) => ({
    loc: `${origin}/business/${encodeURIComponent(business.id)}`,
    lastmod: business.updatedAt.toISOString(),
    changefreq: "weekly",
  }))));
}));

router.get("/share/business/:id", asyncHandler(async (req, res) => {
  const business = await prisma.business.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      category: true,
      location: true,
      description: true,
      website: true,
      address: true,
      verificationLevel: true,
    },
  });
  if (!business) return res.status(404).type("html").send("<!doctype html><title>Business not found | ABRI</title><h1>Business not found</h1>");

  const origin = siteOrigin();
  const canonical = `${origin}/business/${encodeURIComponent(business.id)}`;
  const title = `${business.name} — ${business.category}${business.location ? ` in ${business.location}` : ""} | ABRI`;
  const description = (business.description || `${business.name} is a ${business.category} business${business.location ? ` in ${business.location}` : ""} on ABRI.`)
    .replace(/\s+/g, " ")
    .slice(0, 180);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${canonical}#organization`,
    name: business.name,
    url: canonical,
    description: business.description || description,
    ...(business.website ? { sameAs: [business.website] } : {}),
    ...(business.address ? { address: { "@type": "PostalAddress", streetAddress: business.address, addressCountry: "MY" } } : {}),
  };
  const body = `<!doctype html>
<html lang="en-MY">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="ABRI">
  <meta property="og:type" content="profile">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(`${origin}/social-share.jpg`)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(`${origin}/social-share.jpg`)}">
  <script type="application/ld+json">${jsonForHtml(schema)}</script>
</head>
<body>
  <main>
    <p>ABRI business profile</p>
    <h1>${escapeHtml(business.name)}</h1>
    <p>${escapeHtml([business.category, business.location].filter(Boolean).join(" · "))}</p>
    ${business.description ? `<p>${escapeHtml(business.description)}</p>` : ""}
    ${business.address ? `<p>${escapeHtml(business.address)}</p>` : ""}
    <p>Verification status: ${escapeHtml(business.verificationLevel)}</p>
    <p><a href="${escapeHtml(canonical)}">View this business on ABRI</a></p>
  </main>
</body>
</html>`;

  res
    .type("html")
    .set({
      "Cache-Control": "public, max-age=900, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Language": "en-MY",
    })
    .send(body);
}));

router.get("/robots.txt", (_req, res) => {
  const origin = siteOrigin();
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /login\nDisallow: /register\nDisallow: /forgot-password\nDisallow: /reset-password/\nDisallow: /verify-claim/\n\nSitemap: ${origin}/sitemap.xml\n`);
});

export { router as seoRouter, siteOrigin };
