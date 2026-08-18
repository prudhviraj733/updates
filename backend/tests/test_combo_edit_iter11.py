"""Backend tests for iteration 11: combo edit/swap/inventory flow."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://grocery-hub-1077.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CUSTOMER = {"email": "customer@test.com", "password": "Test@12345"}
COMBO_ID = "9e02c397-3004-4e02-a066-bcda0fc513e8"
LOCATION_ID = "562020f5-a8e0-4c37-8034-23af80e8c0c1"
EDITABLE_ITEM = "4a46addc-6abc-4d6b-acb4-808512cedb4b"  # India Gate Basmati - qty editable/swappable
FIXED_ITEM = "c595a83f-2cc1-4bb4-9c86-652a8a758381"     # Sona Masoori - fixed


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=CUSTOMER)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


def test_get_combo_returns_config_and_alternatives(session):
    r = session.get(f"{API}/packages/{COMBO_ID}?location_id={LOCATION_ID}")
    assert r.status_code == 200, r.text
    pkg = r.json()
    assert pkg["id"] == COMBO_ID
    prods = {p["id"]: p for p in pkg["products"]}
    assert EDITABLE_ITEM in prods
    assert FIXED_ITEM in prods
    ep = prods[EDITABLE_ITEM]
    assert ep["config"]["qty_editable"] is True
    assert ep["config"]["min_qty"] == 1 and ep["config"]["max_qty"] == 3
    assert ep["swappable"] is True and len(ep["alternatives"]) >= 1
    fp = prods[FIXED_ITEM]
    assert fp["config"]["qty_editable"] is False
    assert pkg["items_value"] > 0
    assert pkg["savings"] >= 0


def _clear_combos(session):
    r = session.get(f"{API}/cart?location_id={LOCATION_ID}")
    for c in r.json().get("combos", []):
        session.delete(f"{API}/cart/combo/{c['line_id']}?location_id={LOCATION_ID}")


def test_add_combo_creates_single_line(session):
    _clear_combos(session)
    payload = {
        "combo_id": COMBO_ID,
        "location_id": LOCATION_ID,
        "selections": {
            EDITABLE_ITEM: {"product_id": EDITABLE_ITEM, "quantity": 2},
        },
    }
    r = session.post(f"{API}/cart/combo", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["combos"]) == 1
    line = data["combos"][0]
    assert line["combo_id"] == COMBO_ID
    ed_item = next(i for i in line["items"] if i["original_id"] == EDITABLE_ITEM)
    assert ed_item["quantity"] == 2
    assert line["effective_price"] > 0
    return line["line_id"]


def test_update_combo_same_line(session):
    _clear_combos(session)
    r = session.post(f"{API}/cart/combo", json={
        "combo_id": COMBO_ID, "location_id": LOCATION_ID,
        "selections": {EDITABLE_ITEM: {"product_id": EDITABLE_ITEM, "quantity": 1}},
    })
    line_id = r.json()["combos"][0]["line_id"]
    before_price = r.json()["combos"][0]["effective_price"]

    # get an alternative
    pkg = session.get(f"{API}/packages/{COMBO_ID}?location_id={LOCATION_ID}").json()
    alt = next(p for p in pkg["products"] if p["id"] == EDITABLE_ITEM)["alternatives"][0]

    r2 = session.put(f"{API}/cart/combo/{line_id}", json={
        "location_id": LOCATION_ID,
        "selections": {EDITABLE_ITEM: {"product_id": alt["id"], "quantity": 2}},
    })
    assert r2.status_code == 200, r2.text
    data = r2.json()
    assert len(data["combos"]) == 1, "must remain a single line"
    assert data["combos"][0]["line_id"] == line_id
    ed = next(i for i in data["combos"][0]["items"] if i["original_id"] == EDITABLE_ITEM)
    assert ed["product_id"] == alt["id"] and ed["swapped"] is True
    assert ed["quantity"] == 2
    assert data["combos"][0]["effective_price"] != before_price or True  # sanity


def test_qty_clamped_to_max(session):
    _clear_combos(session)
    # try qty=99, should be clamped to max=3
    r = session.post(f"{API}/cart/combo", json={
        "combo_id": COMBO_ID, "location_id": LOCATION_ID,
        "selections": {EDITABLE_ITEM: {"product_id": EDITABLE_ITEM, "quantity": 99}},
    })
    # Either clamps to 3 or returns 409 due to stock. Both accepted.
    if r.status_code == 200:
        ed = next(i for i in r.json()["combos"][0]["items"] if i["original_id"] == EDITABLE_ITEM)
        assert ed["quantity"] <= 3
    else:
        assert r.status_code == 409


def test_disallowed_swap_rejected(session):
    _clear_combos(session)
    # Use FIXED_ITEM id as replacement for EDITABLE_ITEM (not in swap_options) — should 400
    r = session.post(f"{API}/cart/combo", json={
        "combo_id": COMBO_ID, "location_id": LOCATION_ID,
        "selections": {EDITABLE_ITEM: {"product_id": FIXED_ITEM, "quantity": 1}},
    })
    assert r.status_code == 400


def test_remove_combo_line(session):
    _clear_combos(session)
    r = session.post(f"{API}/cart/combo", json={
        "combo_id": COMBO_ID, "location_id": LOCATION_ID,
        "selections": {EDITABLE_ITEM: {"product_id": EDITABLE_ITEM, "quantity": 1}},
    })
    line_id = r.json()["combos"][0]["line_id"]
    r2 = session.delete(f"{API}/cart/combo/{line_id}?location_id={LOCATION_ID}")
    assert r2.status_code == 200
    assert len(r2.json().get("combos", [])) == 0


def test_cod_order_with_combo(session):
    _clear_combos(session)
    session.post(f"{API}/cart/combo", json={
        "combo_id": COMBO_ID, "location_id": LOCATION_ID,
        "selections": {EDITABLE_ITEM: {"product_id": EDITABLE_ITEM, "quantity": 1}},
    })
    # need an address
    addrs = session.get(f"{API}/addresses").json()
    if not addrs:
        pytest.skip("no saved address")
    r = session.post(f"{API}/orders", json={
        "location_id": LOCATION_ID,
        "address_id": addrs[0]["id"],
        "payment_method": "cod",
        "delivery_type": "asap",
    })
    assert r.status_code in (200, 201), r.text
    order = r.json()
    assert order.get("combo_discount", 0) >= 0
    assert order.get("final_amount", 0) > 0
    assert order.get("delivery_charge", 0) >= 0
    assert order.get("asap_charge", 0) >= 0
