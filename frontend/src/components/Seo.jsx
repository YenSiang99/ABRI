import { useEffect } from "react";

import { SITE_ORIGIN } from "@/lib/site";

const DEFAULT_IMAGE = `${SITE_ORIGIN}/social-share.jpg`;

function absoluteUrl(value) {
  if (!value) return SITE_ORIGIN;
  try {
    return new URL(value, SITE_ORIGIN).toString();
  } catch {
    return SITE_ORIGIN;
  }
}

function setMeta(attribute, name, content) {
  let element = document.head.querySelector(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setLink(rel, href) {
  let element = document.head.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement("link");
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
}

function removeOptionalLinks(selector) {
  document.head.querySelectorAll(selector).forEach((element) => element.remove());
}

function Seo({
  title,
  description,
  path,
  image = DEFAULT_IMAGE,
  imageAlt = "ABRI verified business network",
  type = "website",
  noindex = false,
  prev,
  next,
  jsonLd,
}) {
  useEffect(() => {
    const pageTitle = title.includes("ABRI") ? title : `${title} | ABRI`;
    const canonical = absoluteUrl(path ?? window.location.pathname);
    const imageUrl = absoluteUrl(image);

    document.documentElement.lang = "en-MY";
    document.title = pageTitle;
    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    setMeta("property", "og:site_name", "ABRI");
    setMeta("property", "og:title", pageTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", canonical);
    setMeta("property", "og:image", imageUrl);
    setMeta("property", "og:image:alt", imageAlt);
    setMeta("property", "og:locale", "en_MY");
    setMeta("name", "twitter:card", "summary_large_image");
    setMeta("name", "twitter:title", pageTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", imageUrl);
    setMeta("name", "twitter:image:alt", imageAlt);
    setLink("canonical", canonical);

    removeOptionalLinks('link[data-seo="pagination"]');
    for (const [rel, href] of [["prev", prev], ["next", next]]) {
      if (!href) continue;
      const link = document.createElement("link");
      link.rel = rel;
      link.href = absoluteUrl(href);
      link.dataset.seo = "pagination";
      document.head.appendChild(link);
    }

    document.querySelectorAll('script[data-seo="page-schema"]').forEach((script) => script.remove());
    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seo = "page-schema";
      script.text = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }, [description, image, imageAlt, jsonLd, next, noindex, path, prev, title, type]);

  return null;
}

export { Seo };
