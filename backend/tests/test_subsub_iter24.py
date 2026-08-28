"""Iteration 24 re-test: verify fixes for cross-level listing leak, duplicate label,
sub-subcategory CRUD + product chain, legacy reachability data setup."""
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
API = base_url.rstrip("/") + "/api"

ADMIN = {"email": "prudhvirajm847@gmail.com", "password": "Admin@12345"}


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN)
    if r.status_code != 200:
        pytest.fail(f"admin login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def hierarchy(admin):
    """Return (top_category, subcategory_with_subsubs_or_none, all data) discovered live."""
    cats = requests.get(f"{API}/categories").json()
    assert isinstance(cats, list) and cats
    top = cats[0]
    subs = requests.get(f"{API}/subcategories?category_id={top['id']}").json()
    return {"cats": cats, "top": top, "subs": subs}


@pytest.fixture(scope="session")
def created(admin):
    ids = []
    yield ids
    for cid in ids:
        admin.delete(f"{API}/admin/categories/{cid}")


# --- FIX VERIFY: cross-level listing leak ---
class TestCrossLevelLeak:
    def test_subcategories_with_subcategory_id_returns_empty(self, hierarchy):
        subs = hierarchy["subs"]
        assert subs, "no subcategories found to test with"
        r = requests.get(f"{API}/subcategories?category_id={subs[0]['id']}")
        assert r.status_code == 200
        assert r.json() == [], f"leak: {r.json()}"

    def test_subsubcategories_with_top_category_id_returns_empty(self, hierarchy):
        r = requests.get(f"{API}/subsubcategories?subcategory_id={hierarchy['top']['id']}")
        assert r.status_code == 200
        assert r.json() == [], f"leak: {r.json()}"

    def test_correct_level_calls_work(self, hierarchy, admin, created):
        sub = hierarchy["subs"][0]
        r = admin.post(f"{API}/admin/categories", json={"name": "TEST_SS_LVL", "parent_id": sub["id"]})
        assert r.status_code == 200, r.text
        ss = r.json()
        created.append(ss["id"])
        got = requests.get(f"{API}/subsubcategories?subcategory_id={sub['id']}").json()
        assert any(x["id"] == ss["id"] for x in got)
        # subcategory list for its top category still returns the subcategory
        got2 = requests.get(f"{API}/subcategories?category_id={hierarchy['top']['id']}").json()
        assert any(x["id"] == sub["id"] for x in got2)
        # unfiltered subsubcategories includes it, unfiltered subcategories does not
        allss = requests.get(f"{API}/subsubcategories").json()
        assert any(x["id"] == ss["id"] for x in allss)
        allsubs = requests.get(f"{API}/subcategories").json()
        assert not any(x["id"] == ss["id"] for x in allsubs)

    def test_unknown_parent_id_returns_empty(self):
        assert requests.get(f"{API}/subcategories?category_id=doesnotexist").json() == []
        assert requests.get(f"{API}/subsubcategories?subcategory_id=doesnotexist").json() == []


# --- FIX VERIFY: duplicate label ---
class TestDuplicateLabel:
    def test_duplicate_subsubcategory_label(self, admin, hierarchy, created):
        sub = hierarchy["subs"][0]
        name = "TEST_SS_DUP"
        r1 = admin.post(f"{API}/admin/categories", json={"name": name, "parent_id": sub["id"]})
        assert r1.status_code == 200, r1.text
        created.append(r1.json()["id"])
        r2 = admin.post(f"{API}/admin/categories", json={"name": name, "parent_id": sub["id"]})
        assert r2.status_code == 400
        detail = r2.json().get("detail", "")
        assert "Sub-subcategory" in detail, detail

    def test_duplicate_subcategory_label(self, admin, hierarchy):
        sub = hierarchy["subs"][0]
        r = admin.post(f"{API}/admin/categories", json={"name": sub["name"], "parent_id": hierarchy["top"]["id"]})
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert detail.startswith("Subcategory"), detail

    def test_duplicate_top_category_label(self, admin, hierarchy):
        r = admin.post(f"{API}/admin/categories", json={"name": hierarchy["top"]["name"], "parent_id": None})
        assert r.status_code == 400
        assert r.json().get("detail", "").startswith("Category")


# --- Regression: admin listings + soft delete ---
class TestAdminListings:
    def test_admin_lists_and_soft_delete(self, admin, hierarchy):
        sub = hierarchy["subs"][0]
        r = admin.post(f"{API}/admin/categories", json={"name": "TEST_SS_DEL", "parent_id": sub["id"]})
        assert r.status_code == 200
        ss = r.json()
        admin_ss = admin.get(f"{API}/admin/subsubcategories")
        assert admin_ss.status_code == 200
        assert any(x["id"] == ss["id"] for x in admin_ss.json())
        d = admin.delete(f"{API}/admin/categories/{ss['id']}")
        assert d.status_code == 200
        pub = requests.get(f"{API}/subsubcategories?subcategory_id={sub['id']}").json()
        assert not any(x["id"] == ss["id"] for x in pub), "deactivated ss still public"
        # admin list keeps it but flagged inactive so frontend can filter
        rec = next((x for x in admin.get(f"{API}/admin/subsubcategories").json() if x["id"] == ss["id"]), None)
        assert rec is not None
        assert rec.get("is_active") is False

    def test_admin_endpoints_require_admin(self):
        for path in ("/admin/subsubcategories", "/admin/subcategories", "/admin/categories"):
            r = requests.get(f"{API}{path}")
            assert r.status_code in (401, 403), f"{path} -> {r.status_code}"


# --- Regression: product chain validation + filtering ---
class TestProductChain:
    def test_product_chain_and_filter(self, admin, hierarchy, created):
        sub = hierarchy["subs"][0]
        cat = hierarchy["top"]
        ss = admin.post(f"{API}/admin/categories", json={"name": "TEST_SS_PROD", "parent_id": sub["id"]}).json()
        created.append(ss["id"])
        loc = requests.get(f"{API}/locations").json()[0]
        payload = {
            "name": "TEST_PROD_ITER24", "description": "qa", "category_id": cat["id"],
            "subcategory_id": sub["id"], "subsubcategory_id": ss["id"], "unit": "1 kg",
            "mrp": 100, "price": 90, "image_url": "https://images.unsplash.com/photo-1",
            "location_ids": [loc["id"]], "stock": 10, "is_active": True,
        }
        r = admin.post(f"{API}/admin/products", json=payload)
        assert r.status_code in (200, 201), r.text
        prod = r.json()
        pid = prod["id"]
        try:
            assert prod.get("subsubcategory_id") == ss["id"]
            got = requests.get(f"{API}/products/{pid}")
            assert got.status_code == 200
            assert got.json()["subsubcategory_id"] == ss["id"]
            filtered = requests.get(
                f"{API}/products?subsubcategory_id={ss['id']}&location_id={loc['id']}").json()
            assert any(p["id"] == pid for p in filtered)
            # broken chain rejected
            other_sub = next((s for s in hierarchy["subs"] if s["id"] != sub["id"]), None)
            if other_sub:
                bad = dict(payload)
                bad["subcategory_id"] = other_sub["id"]
                rb = admin.post(f"{API}/admin/products", json=bad)
                assert rb.status_code == 400, f"expected 400, got {rb.status_code}"
        finally:
            admin.delete(f"{API}/admin/products/{pid}")


# --- Regression: search-resolve ---
class TestSearchResolve:
    def test_not_found(self):
        r = requests.get(f"{API}/products/search-resolve?q=zzzqqqnotathing")
        assert r.status_code == 200
        assert r.json()["status"] == "not_found"

    def test_available(self):
        prods = requests.get(f"{API}/products").json()
        assert prods
        name = prods[0]["name"].split()[0]
        r = requests.get(f"{API}/products/search-resolve?q={name}")
        assert r.status_code == 200
        assert r.json()["status"] in ("available", "out_of_stock")

    def test_empty_query(self):
        r = requests.get(f"{API}/products/search-resolve?q=")
        assert r.status_code in (200, 400, 422)
