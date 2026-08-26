import requests, uuid
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
def login(e,p):
    s=requests.Session(); s.post(f"{API}/auth/login",json={"email":e,"password":p}).raise_for_status(); return s
admin=login("prudhvirajm847@gmail.com","Admin@12345")
cust=login("customer@test.com","Test@12345")
locs=cust.get(f"{API}/locations").json()
loc=pin=prods=None
for L in locs:
    for pc in (L.get("pincodes") or [None]):
        pr=cust.get(f"{API}/products",params={"pincode":pc,"location_id":L["id"]}).json()
        pr=[p for p in (pr if isinstance(pr,list) else pr.get("products",[])) if (p.get("selling_price") or 0)>0]
        if pr: loc,pin,prods=L,pc,pr; break
    if prods: break
loc_id=loc["id"]; target=prods[0]; price=target["selling_price"]
# clear + add 1
c=cust.get(f"{API}/cart",params={"location_id":loc_id,"pincode":pin}).json()
for it in c.get("items",[]):
    if it.get("product_id"): cust.delete(f"{API}/cart/items/{it['product_id']}",params={"location_id":loc_id,"pincode":pin})
cust.post(f"{API}/cart/items",json={"product_id":target["id"],"location_id":loc_id,"pincode":pin,"quantity":1})
real_sub=price*1
# general % coupon 10% max 100000 (no cap), min 0
code="TAMPER"+uuid.uuid4().hex[:5].upper()
r=admin.post(f"{API}/admin/coupons",json={"code":code,"coupon_type":"product","discount_type":"percentage","discount_value":10,"min_order_value":0,"is_active":True})
cid=r.json()["id"]
# tamper subtotal huge
r=cust.post(f"{API}/coupons/validate",json={"code":code,"location_id":loc_id,"subtotal":999999})
disc=r.json().get("discount")
expected=round(real_sub*0.10,2)
print("real_sub",real_sub,"tampered subtotal 999999 -> discount",disc,"expected",expected)
ok = r.status_code==200 and abs(disc-expected)<0.01
admin.delete(f"{API}/admin/coupons/{cid}")
for it in cust.get(f"{API}/cart",params={"location_id":loc_id,"pincode":pin}).json().get("items",[]):
    if it.get("product_id"): cust.delete(f"{API}/cart/items/{it['product_id']}",params={"location_id":loc_id,"pincode":pin})
print("GENERAL TAMPER-PROOF:", "PASS" if ok else "FAIL")
