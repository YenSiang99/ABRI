import { useLocation } from "react-router-dom";

import { Seo } from "@/components/Seo";
import { SITE_ORIGIN } from "@/lib/site";

const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: "ABRI",
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/social-share.jpg`,
      areaServed: { "@type": "Country", name: "Malaysia" },
      description: "ABRI is a Malaysian business network for verifying companies and building trust through evidence-backed business relationships.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      url: SITE_ORIGIN,
      name: "ABRI",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_ORIGIN}/directory?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

const PAGE_META = {
  "/directory": {
    title: "Malaysia Business Directory",
    description: "Browse Malaysian businesses, compare public company information, and find SSM-verified profiles on ABRI.",
  },
  "/about": {
    title: "About ABRI",
    description: "Learn how ABRI helps Malaysian businesses build verifiable trust through SSM checks, peer endorsements, and business profiles.",
  },
  "/contact": {
    title: "Contact ABRI",
    description: "Contact the ABRI team for help with business listings, claims, verification, or the ABRI platform.",
  },
  "/faq": {
    title: "Frequently Asked Questions",
    description: "Answers to common questions about ABRI business claims, SSM verification, memberships, listings, and endorsements.",
  },
  "/ask": {
    title: "Ask ABRI",
    description: "Ask questions about ABRI business listings, SSM verification, claims, membership, and endorsements.",
  },
  "/privacy": {
    title: "Privacy Policy",
    description: "Read how ABRI collects, uses, protects, and manages information in its Malaysian business directory.",
  },
  "/terms": {
    title: "Terms of Use",
    description: "Read the terms that govern access to ABRI and use of its business directory and networking services.",
  },
};

function RouteSeo() {
  const { pathname } = useLocation();
  const privatePath = pathname.startsWith("/app") || pathname.startsWith("/admin");
  const utilityPath = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-claim", "/m/"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (pathname.startsWith("/business/") || pathname === "/directory" || pathname === "/faq") return null;

  const meta = PAGE_META[pathname] ?? {
    title: pathname === "/" ? "ABRI — Verified Business Network Malaysia" : "ABRI",
    description: privatePath
      ? "Private ABRI member area."
      : "ABRI is a Malaysian business network for verified company profiles, trusted endorsements, and business discovery.",
  };

  return (
    <Seo
      title={meta.title}
      description={meta.description}
      path={pathname}
      noindex={privatePath || utilityPath}
      jsonLd={!privatePath && !utilityPath ? ORGANIZATION_SCHEMA : undefined}
    />
  );
}

export { RouteSeo };
