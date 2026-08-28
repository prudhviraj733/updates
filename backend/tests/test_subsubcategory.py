"""E2E test: sub-subcategory hierarchy, validation, filtering, search-resolve. Cleans up after itself."""
import os
import uuid
import requests

API = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}
T = uuid.uuid4().hex[:6].upper()

s = requests.Session()


def login():
    r = s.post(f"{API}/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"


def main():
    login()
    created = []
    try:
        cat = s.post(f"{API}/admin/categories", json={"name": f"TCAT_{T}", "parent_id": None}).json()
        created.append(cat["id"])
        sub = s.post(f"{API}/admin/categories", json={"name": f"TSUB_{T}", "parent_id": cat["id"]}).json()
        created.append(sub["id"])
        ssub = s.post(f"{API}/admin/categories", json={"name": f"TSSUB_{T}", "parent_id": sub["id"]}).json()
        created.append(ssub["id"])
        print("PASS create hierarchy")

        subs = s.get(f"{API}/subcategories?category_id={cat['id']}").json()
        assert any(x["id"] == sub["id"] for x in subs), "sub not in subcategories"
        assert not any(x["id"] == ssub["id"] for x in subs), "subsub leaked into subcategories"
        ssubs = s.get(f"{API}/subsubcategories?subcategory_id={sub['id']}").json()
        assert any(x["id"] == ssub["id"] for x in ssubs), "subsub missing"
        # cross-level guard
        assert s.get(f"{API}/subcategories?category_id={sub['id']}").json() == [], "level leak in subcategories"
        assert s.get(f"{API}/subsubcategories?subcategory_id={cat['id']}").json() == [], "level leak in subsubcategories"
        print("PASS listing separation + cross-level guard")

        loc = s.get(f"{API}/locations").json()[0]["id"]
        base = {"name": f"TPROD_{T}", "category_id": cat["id"], "subcategory_id": sub["id"],
                "subsubcategory_id": ssub["id"], "mrp": 100, "selling_price": 90, "location_ids": [loc]}
        prod = s.post(f"{API}/admin/products", json=base)
        assert prod.status_code == 200, prod.text
        created_prod = prod.json()["id"]
        print("PASS create product with subsubcategory")

        bad = s.post(f"{API}/admin/products", json={**base, "subsubcategory_id": sub["id"]})
        assert bad.status_code == 400, f"expected 400 got {bad.status_code}"
        cat2 = s.post(f"{API}/admin/categories", json={"name": f"TCAT2_{T}", "parent_id": None}).json()
        created.append(cat2["id"])
        bad2 = s.post(f"{API}/admin/products", json={**base, "category_id": cat2["id"]})
        assert bad2.status_code == 400, f"expected 400 got {bad2.status_code}"
        print("PASS hierarchy validation rejects mismatches")

        f = s.get(f"{API}/products?subsubcategory_id={ssub['id']}").json()
        assert any(p["id"] == created_prod for p in f), "subsub filter missing product"
        print("PASS product filter by subsubcategory")

        legacy = s.post(f"{API}/admin/products", json={"name": f"TLEG_{T}", "category_id": cat["id"],
                        "subcategory_id": sub["id"], "mrp": 50, "selling_price": 45, "location_ids": [loc]})
        assert legacy.status_code == 200, legacy.text
        created_legacy = legacy.json()["id"]
        print("PASS legacy product without subsubcategory")

        nf = s.get(f"{API}/products/search-resolve?q=QQZZNOEXIST&location_id={loc}").json()
        assert nf["status"] == "not_found", nf
        print("PASS search-resolve not_found")

        sr = s.get(f"{API}/products/search-resolve?q=TPROD_{T}&location_id={loc}").json()
        assert sr["status"] in ("out_of_stock", "available"), sr
        print(f"PASS search-resolve status={sr['status']}")

        s.delete(f"{API}/admin/products/{created_prod}")
        s.delete(f"{API}/admin/products/{created_legacy}")
        print("ALL SUBSUBCATEGORY TESTS PASSED")
    finally:
        for cid in created:
            s.delete(f"{API}/admin/categories/{cid}")


if __name__ == "__main__":
    main()
