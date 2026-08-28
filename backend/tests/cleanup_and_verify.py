import os
import requests

API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
s = requests.Session()
r = s.post(f"{API}/auth/login", json={"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"})
tok = r.json().get("token")
if tok:
    s.headers["Authorization"] = f"Bearer {tok}"

# 1) Deactivate leftover test products
prods = s.get(f"{API}/admin/products").json()
killed = []
for p in prods:
    n = (p.get("name") or "").upper()
    if p.get("is_active") and (n.startswith("TEST_PROD") or n.startswith("TESTPROD_") or n.startswith("QA UNAVAILABLE") or n.startswith("TESTLEGACY")):
        s.delete(f"{API}/admin/products/{p['id']}")
        killed.append(p["name"])
print("Deactivated leftover test products:", killed)

# 2) Verify cross-level leak fixed
cats = s.get(f"{API}/categories").json()
if cats:
    subs = s.get(f"{API}/subcategories?category_id={cats[0]['id']}").json()
    # passing a subcategory id to /subcategories must NOT return anything (wrong level)
    if subs:
        leak = s.get(f"{API}/subcategories?category_id={subs[0]['id']}").json()
        print("Leak check /subcategories?category_id=<subcat id> ->", len(leak), "(expect 0)")
    # passing a top category id to /subsubcategories must return [] (wrong level)
    leak2 = s.get(f"{API}/subsubcategories?subcategory_id={cats[0]['id']}").json()
    print("Leak check /subsubcategories?subcategory_id=<cat id> ->", len(leak2), "(expect 0)")
