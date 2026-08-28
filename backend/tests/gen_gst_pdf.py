import requests, asyncio
from motor.motor_asyncio import AsyncIOMotorClient
API = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0].strip() + "/api"
MONGO="mongodb://localhost:27017"; DB="test_database"
def login(e,p):
    s=requests.Session(); s.post(f"{API}/auth/login",json={"email":e,"password":p}).raise_for_status(); return s
R=asyncio.get_event_loop().run_until_complete
async def sg(**k):
    c=AsyncIOMotorClient(MONGO); await c[DB].business_settings.update_one({"key":"global"},{"$set":k},upsert=True); c.close()
async def sp(pid,r):
    c=AsyncIOMotorClient(MONGO); await c[DB].products.update_one({"id":pid},{"$set":{"gst_rate":r}}); c.close()
async def dele(oid):
    c=AsyncIOMotorClient(MONGO); await c[DB].orders.delete_one({"id":oid}); c.close()
cust=login("customer@test.com","Test@12345")
locs=cust.get(f"{API}/locations").json()
loc=pin=prods=None
for L in locs:
    for pc in (L.get("pincodes") or [None]):
        pr=cust.get(f"{API}/products",params={"pincode":pc,"location_id":L["id"]}).json()
        pr=[p for p in (pr if isinstance(pr,list) else pr.get("products",[])) if (p.get("selling_price") or 0)>0]
        if len(pr)>=2: loc,pin,prods=L,pc,pr; break
    if prods: break
loc_id=loc["id"]; p1,p2=prods[0],prods[1]
R(sg(gst_enabled=True,gst_pricing="inclusive",gstin="29ABCDE1234F1Z5",gst_split="cgst_sgst")); R(sp(p1["id"],5)); R(sp(p2["id"],18))
addrs=cust.get(f"{API}/addresses").json(); addr=next((a for a in addrs if a.get("pincode")==pin),None)
addr_id=addr["id"]
for it in cust.get(f"{API}/cart",params={"location_id":loc_id,"pincode":pin}).json().get("items",[]):
    if it.get("product_id"): cust.delete(f"{API}/cart/items/{it['product_id']}",params={"location_id":loc_id,"pincode":pin})
cust.post(f"{API}/cart/items",json={"product_id":p1["id"],"location_id":loc_id,"pincode":pin,"quantity":2})
cust.post(f"{API}/cart/items",json={"product_id":p2["id"],"location_id":loc_id,"pincode":pin,"quantity":1})
d=cust.get(f"{API}/delivery/slots/range",params={"days":3,"location_id":loc_id}).json()
slot=next((s["id"] for day in d.get("days",[]) for s in day.get("slots",[]) if s.get("available")),None)
o=cust.post(f"{API}/orders",json={"location_id":loc_id,"address_id":addr_id,"delivery_type":"slot","slot_id":slot,"payment_method":"cod","coupon_code":None}).json()
pdf=cust.get(f"{API}/orders/{o['id']}/receipt")
open("/tmp/gst_receipt.pdf","wb").write(pdf.content)
print("saved gst pdf, order", o["order_number"], "tax", o["gst"]["total_tax"])
R(dele(o["id"]))
R(sg(gst_enabled=False,gstin="")); R(sp(p1["id"],0)); R(sp(p2["id"],0))
for it in cust.get(f"{API}/cart",params={"location_id":loc_id,"pincode":pin}).json().get("items",[]):
    if it.get("product_id"): cust.delete(f"{API}/cart/items/{it['product_id']}",params={"location_id":loc_id,"pincode":pin})
print("done, reset to GST off")
