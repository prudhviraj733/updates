"""Seed one real sub-subcategory under a real subcategory that has products, and move
one product into it, so the customer drill-down UI can be exercised. Prints IDs.
Run with --cleanup to revert."""
import json
import os
import sys

import requests
from dotenv import dotenv_values

base = os.environ.get("REACT_APP_BACKEND_URL") or dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"]
API = base.rstrip("/") + "/api"
STATE = "/app/test_reports/ui_subsub_state.json"
s = requests.Session()
r = s.post(f"{API}/auth/login", json={"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"})
r.raise_for_status()
tok = r.json().get("token")
if tok:
    s.headers["Authorization"] = f"Bearer {tok}"


def cleanup():
    st = json.load(open(STATE))
    for pid, orig in st["products"].items():
        s.put(f"{API}/admin/products/{pid}", json=orig)
    for cid in st["cats"]:
        s.delete(f"{API}/admin/categories/{cid}")
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
        if len(prods) >= 2 and not existing_ss:
            target = (c, sub, prods)
            break
    if target:
        break
if not target:
    print("NO_TARGET")
    sys.exit(1)
cat, sub, prods = target
ss = s.post(f"{API}/admin/categories", json={"name": "QA Type A", "parent_id": sub["id"]}).json()
p = prods[0]
orig = {k: v for k, v in p.items() if k not in ("_id", "discount_percent", "stock", "in_stock", "id", "created_at", "updated_at")}
payload = dict(orig)
payload["subsubcategory_id"] = ss["id"]
up = s.put(f"{API}/admin/products/{p['id']}", json=payload)
assert up.status_code == 200, up.text
state = {"cats": [ss["id"]], "products": {p["id"]: orig}}
json.dump(state, open(STATE, "w"))
print(json.dumps({"category": {"id": cat["id"], "name": cat["name"]},
                  "subcategory": {"id": sub["id"], "name": sub["name"]},
                  "subsub": {"id": ss["id"], "name": ss["name"]},
                  "product": {"id": p["id"], "name": p["name"]},
                  "sub_product_count": len(prods)}, indent=2))
