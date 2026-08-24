"""Dynamic robots.txt and sitemap.xml for SEO.

Served under /api/seo/* and mapped to /robots.txt and /sitemap.xml at the edge
(nginx) so crawlers find them at the site root.
"""
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Response

from core.db import db

router = APIRouter()


def _site() -> str:
    return (os.environ.get("FRONTEND_URL") or "https://bestkart.in").rstrip("/")


@router.get("/seo/robots.txt")
async def robots_txt():
    site = _site()
    body = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /admin\n"
        "Disallow: /checkout\n"
        "Disallow: /account\n"
        "Disallow: /orders\n"
        "Disallow: /wallet\n"
        "Disallow: /notifications\n"
        "Disallow: /my-coupons\n"
        "Disallow: /referral\n\n"
        f"Sitemap: {site}/sitemap.xml\n"
    )
    return Response(content=body, media_type="text/plain")


@router.get("/seo/sitemap.xml")
async def sitemap_xml():
    site = _site()
    today = datetime.now(timezone.utc).date().isoformat()
    entries = [("/", "1.0", "daily"), ("/products", "0.9", "daily"), ("/offers", "0.8", "weekly")]

    try:
        prods = await db.products.find(
            {"is_active": {"$ne": False}}, {"id": 1, "_id": 0}).to_list(5000)
        for p in prods:
            if p.get("id"):
                entries.append((f"/product/{p['id']}", "0.7", "weekly"))
    except Exception:
        pass

    xml = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, priority, freq in entries:
        xml.append(
            f"  <url><loc>{site}{path}</loc><lastmod>{today}</lastmod>"
            f"<changefreq>{freq}</changefreq><priority>{priority}</priority></url>")
    xml.append("</urlset>")
    return Response(content="\n".join(xml), media_type="application/xml")
