import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Star } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useStore } from "@/context/StoreContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = { label: "Home", full_name: "", phone: "", line1: "", line2: "", city: "", area: "", pincode: "", is_default: false };

export default function Account() {
  const { user, updateProfile } = useAuth();
  const { locations } = useStore();
  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [addresses, setAddresses] = useState([]);
  const [addrOpen, setAddrOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY, location_id: "" });

  useEffect(() => {
    if (user && user !== false) setProfile({ name: user.name, phone: user.phone || "" });
    api.get("/addresses").then(({ data }) => setAddresses(data));
  }, [user]);

  const saveProfile = async () => {
    await updateProfile(profile);
    toast.success("Profile updated");
  };

  const saveAddress = async () => {
    try {
      const loc = form.location_id || locations[0]?.id;
      const { data } = await api.post("/addresses", { ...form, location_id: loc });
      setAddresses((a) => [...a, data]);
      setAddrOpen(false);
      setForm({ ...EMPTY, location_id: "" });
      toast.success("Address added");
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const del = async (id) => { await api.delete(`/addresses/${id}`); setAddresses((a) => a.filter((x) => x.id !== id)); };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="font-heading text-3xl font-bold">My Account</h1>
      <Tabs defaultValue="profile" className="mt-6">
        <TabsList><TabsTrigger value="profile" data-testid="tab-profile">Profile</TabsTrigger><TabsTrigger value="addresses" data-testid="tab-addresses">Addresses</TabsTrigger></TabsList>

        <TabsContent value="profile" className="mt-4">
          <div className="rounded-2xl border border-black/5 bg-white p-6">
            <div className="grid gap-4">
              <div><Label>Name</Label><Input className="mt-1" data-testid="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
              <div><Label>Email</Label><Input className="mt-1" value={user?.email || ""} disabled /></div>
              <div><Label>Phone</Label><Input className="mt-1" data-testid="profile-phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
              <Button className="w-fit rounded-full bg-forest" onClick={saveProfile} data-testid="save-profile">Save changes</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="addresses" className="mt-4">
          <Button className="rounded-full bg-forest" onClick={() => setAddrOpen(true)} data-testid="add-address"><Plus className="mr-1 h-4 w-4" />Add address</Button>
          <div className="mt-4 space-y-3">
            {addresses.map((a) => (
              <div key={a.id} className="flex items-start justify-between rounded-2xl border border-black/5 bg-white p-5" data-testid={`account-address-${a.id}`}>
                <div>
                  <p className="flex items-center gap-2 font-medium">{a.label} · {a.full_name} {a.is_default && <Star className="h-4 w-4 fill-saffron text-saffron" />}</p>
                  <p className="text-sm text-muted-foreground">{a.line1}, {a.area && `${a.area}, `}{a.city} - {a.pincode}</p>
                  <p className="text-sm text-muted-foreground">{a.phone}</p>
                </div>
                <button onClick={() => del(a.id)}><Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" /></button>
              </div>
            ))}
            {addresses.length === 0 && <p className="text-sm text-muted-foreground">No saved addresses.</p>}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={addrOpen} onOpenChange={setAddrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Add address</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              <Input placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Input placeholder="Address line 1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder="Area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
              <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              <Input placeholder="Pincode" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
            </div>
            <select className="rounded-md border p-2 text-sm" value={form.location_id} onChange={(e) => setForm({ ...form, location_id: e.target.value })}>
              <option value="">Select service location</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <DialogFooter><Button className="rounded-full bg-forest" onClick={saveAddress} data-testid="account-save-address">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
