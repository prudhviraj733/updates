"""Iteration 24 seed: create a sub-subcategory under a subcategory that already has
MULTIPLE legacy products (subsubcategory_id null), and move ONE product into it.
This exercises the 'All <subcategory>' chip legacy-reachability fix.
Run with --cleanup to revert."""
import json
import os
import sys

import requests
from dotenv import dotenv_values

base = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base.rstrip("/") + "/api"
STATE = "/app/test_reports/ui_subsub_state_iter24.json"
s = requests.Session()
r = s.post(f"{API}/auth/login", json={"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"})
r.raise_for_status()
tok = r.json().get("token")
if tok:
    s.headers["Authorization"] = f"Bearer {tok}"


def cleanup():
    st = json.load(open(STATE))
    for pid, orig in st["products"].items():
        resp = s.put(f"{API}/admin/products/{pid}", json=orig)
        print("revert product", pid, resp.status_code)
    for cid in st["cats"]:
        print("deactivate cat", cid, s.delete(f"{API}/admin/categories/{cid}").status_code)
    print("cleanup done")


if "--cleanup" in sys.argv:
    cleanup()
    sys.exit(0)

cats = s.get(f"{API}/categories").json()
loc = s.get(f"{API}/locations").json()[0]["id"]
target = None
for c in cats:
    subs = s.get(f"{API}/subcategories?category_id={c['id']}").json()
    for sub in subs:
        prods = s.get(f"{API}/products?subcategory_id={sub['id']}&location_id={loc}").json()
        existing_ss = s.get(f"{API}/subsubcategories?subcategory_id={sub['id']}").json()
        if len(prods) >= 3 and not existing_ss:
            target = (c, sub, prods)
            break
    if target:
        break
if not target:
    print("NO_TARGET")
    sys.exit(1)
cat, sub, prods = target
ss = s.post(f"{API}/admin/categories", json={"name": "QA24 Type A", "parent_id": sub["id"]}).json()
p = prods[0]
orig = {k: v for k, v in p.items() if k not in ("_id", "discount_percent", "stock", "in_stock", "id", "created_at", "updated_at")}
payload = dict(orig)
payload["subsubcategory_id"] = ss["id"]
up = s.put(f"{API}/admin/products/{p['id']}", json=payload)
assert up.status_code == 200, up.text
json.dump({"cats": [ss["id"]], "products": {p["id"]: orig}}, open(STATE, "w"))
print(json.dumps({
    "category": {"id": cat["id"], "name": cat["name"]},
    "subcategory": {"id": sub["id"], "name": sub["name"]},
    "subsub": {"id": ss["id"], "name": ss["name"]},
    "moved_product": {"id": p["id"], "name": p["name"]},
    "legacy_products": [x["name"] for x in prods[1:]],
    "sub_product_count": len(prods),
}, indent=2))
