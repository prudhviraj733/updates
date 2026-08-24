import { Helmet } from "react-helmet-async";

const SITE_NAME = "BestKart";
const DEFAULT_DESC =
  "Order rice, dals, oils, spices, dry fruits and daily essentials online. Slot-based delivery or Get in 30 Minutes in select areas.";
const DEFAULT_IMAGE = "/og-default.jpg";

export function Seo({ title, description, image, path, type = "website", jsonLd, noindex = false }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const canonical = origin + (path || (typeof window !== "undefined" ? window.location.pathname : "/"));
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Fresh groceries delivered your way`;
  const desc = description || DEFAULT_DESC;
  const img = image || (origin ? origin + DEFAULT_IMAGE : DEFAULT_IMAGE);

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:url" content={canonical} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
