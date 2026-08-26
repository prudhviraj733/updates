import requests
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
def login(e,p):
    s=requests.Session(); s.post(f"{API}/auth/login", json={"email":e,"password":p}).raise_for_status(); return s
cust=login("customer@test.com","Test@12345")
locs=cust.get(f"{API}/locations").json(); loc=locs[0]; loc_id=loc["id"]; pin=(loc.get("pincodes") or [None])[0]
prods=cust.get(f"{API}/products").json()
prods = prods if isinstance(prods,list) else prods.get("products",[])
p=prods[0]
print("product keys:", list(p.keys()))
print("product category_id:", p.get("category_id"), "name:", p.get("name"))
# clear
c=cust.get(f"{API}/cart?location_id={loc_id}").json()
for it in c.get("items",[]):
    if it.get("product_id"): cust.put(f"{API}/cart/{it['product_id']}", json={"location_id":loc_id,"pincode":pin,"quantity":0})
r=cust.post(f"{API}/cart", json={"product_id":p["id"],"location_id":loc_id,"pincode":pin,"quantity":1})
print("add status", r.status_code, r.text[:200])
c=cust.get(f"{API}/cart?location_id={loc_id}").json()
print("cart items:", [(i.get("product_id"), i.get("quantity")) for i in c.get("items",[])], "subtotal", c.get("subtotal"))
print("pin used:", pin)
