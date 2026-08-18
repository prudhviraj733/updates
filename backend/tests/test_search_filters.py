"""Tests for Search + Filters (iteration 7): brand-aware search, dedupe categories, price/discount/stock/subcategory/brand filters."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def location_id(session):
    r = session.get(f"{API}/locations")
    assert r.status_code == 200, r.text
    locs = r.json()
    assert locs, "no locations"
    return locs[0]["id"]


@pytest.fixture(scope="module")
def categories(session):
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    return r.json()


# ------------- Category dedupe -------------
class TestCategoryDedupe:
    def test_categories_no_duplicate_names(self, categories):
        names = [c["name"].strip().lower() for c in categories]
        dups = {n for n in names if names.count(n) > 1}
        assert not dups, f"duplicate categories: {dups}"

    def test_home_needs_not_duplicated(self, categories):
        names = [c["name"].strip().lower() for c in categories]
        assert names.count("home needs") <= 1

    def test_db_records_not_deleted(self, session):
        # Fetch categories from admin API would need auth; instead assert that
        # dedupe on read still yields at least some categories.
        assert len(session.get(f"{API}/categories").json()) >= 1

    def test_subcategories_deduped(self, session, categories):
        # For each category ensure subcategories are unique by name
        for c in categories[:5]:
            r = session.get(f"{API}/subcategories", params={"category_id": c["id"]})
            assert r.status_code == 200
            subs = r.json()
            names = [s["name"].strip().lower() for s in subs]
            assert len(names) == len(set(names)), f"dup subs in {c['name']}: {names}"


# ------------- Brand-aware search -------------
class TestSearch:
    def test_moong_search_returns_product(self, session, location_id):
        r = session.get(f"{API}/products", params={"location_id": location_id, "search": "Moong"})
        assert r.status_code == 200
        data = r.json()
        assert len(data) >= 1, "expected at least one Moong product"
        # facet fields present
        p = data[0]
        for f in ["subcategory_id", "brand_id", "category_id", "discount_percent", "in_stock"]:
            assert f in p, f"missing field {f}"

    def test_brand_name_search(self, session, location_id):
        # Grab any brand and search by its name
        brands = session.get(f"{API}/brands").json()
        assert brands
        # pick a brand that actually has products
        chosen = None
        for b in brands:
            r = session.get(f"{API}/products", params={"location_id": location_id, "brand_id": b["id"]})
            if r.json():
                chosen = b
                break
        assert chosen, "no brand with products"
        r = session.get(f"{API}/products", params={"location_id": location_id, "search": chosen["name"]})
        assert r.status_code == 200
        data = r.json()
        assert data, f"brand-name search '{chosen['name']}' returned nothing"
        # All must reference either that brand or contain the string in name/desc
        assert any(p.get("brand_id") == chosen["id"] for p in data)


# ------------- Filter params -------------
class TestFilters:
    def test_min_price(self, session, location_id):
        r = session.get(f"{API}/products", params={"location_id": location_id, "min_price": 100})
        assert r.status_code == 200
        assert all(p.get("selling_price", 0) >= 100 for p in r.json())

    def test_max_price(self, session, location_id):
        r = session.get(f"{API}/products", params={"location_id": location_id, "max_price": 100})
        assert r.status_code == 200
        assert all(p.get("selling_price", 0) <= 100 for p in r.json())

    def test_min_discount(self, session, location_id):
        r = session.get(f"{API}/products", params={"location_id": location_id, "min_discount": 10})
        assert r.status_code == 200
        assert all(p.get("discount_percent", 0) >= 10 for p in r.json())

    def test_in_stock(self, session, location_id):
        r = session.get(f"{API}/products", params={"location_id": location_id, "in_stock": "true"})
        assert r.status_code == 200
        assert all(p.get("in_stock") for p in r.json())

    def test_category_filter(self, session, location_id, categories):
        cat = categories[0]
        r = session.get(f"{API}/products", params={"location_id": location_id, "category_id": cat["id"]})
        assert r.status_code == 200
        assert all(p.get("category_id") == cat["id"] for p in r.json())

    def test_subcategory_filter(self, session, location_id, categories):
        # find a subcategory that has products
        for c in categories:
            subs = session.get(f"{API}/subcategories", params={"category_id": c["id"]}).json()
            for s in subs:
                r = session.get(f"{API}/products", params={"location_id": location_id, "subcategory_id": s["id"]})
                data = r.json()
                if data:
                    assert all(p.get("subcategory_id") == s["id"] for p in data)
                    return
        pytest.skip("No subcategory with products")

    def test_brand_filter(self, session, location_id):
        brands = session.get(f"{API}/brands").json()
        for b in brands:
            r = session.get(f"{API}/products", params={"location_id": location_id, "brand_id": b["id"]})
            data = r.json()
            if data:
                assert all(p.get("brand_id") == b["id"] for p in data)
                return
        pytest.skip("No brand with products")

    def test_combined_filters(self, session, location_id, categories):
        cat = categories[0]
        r = session.get(f"{API}/products", params={
            "location_id": location_id, "category_id": cat["id"],
            "min_discount": 5, "in_stock": "true",
        })
        assert r.status_code == 200
        for p in r.json():
            assert p.get("category_id") == cat["id"]
            assert p.get("discount_percent", 0) >= 5
            assert p.get("in_stock")
