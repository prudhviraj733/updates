import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus, Star, ShieldCheck, ShieldAlert, MapPin } from "lucide-react";
import api from "@/lib/api";
import { getCurrentPosition, reverseGeocode, geoErrorMessage } from "@/lib/geo";
import { useAuth } from "@/context/AuthContext";
import { useStore } from "@/context/StoreContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const EMPTY = { label: "Home", full_name: "", phone: "", line1: "", line2: "", city: "", area: "", pincode: "", latitude: null, longitude: null, is_default: false };

export default function Account() {
  const { user, updateProfile, refresh } = useAuth();
  const { locations } = useStore();
  const [name, setName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [addresses, setAddresses] = useState([]);
  const [addrOpen, setAddrOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY, location_id: "" });
  const [locating, setLocating] = useState(false);

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const { latitude, longitude } = await getCurrentPosition();
      const geo = await reverseGeocode(latitude, longitude);
      setForm((a) => ({
        ...a, latitude, longitude,
        pincode: geo?.pincode || a.pincode,
        city: geo?.city || a.city,
        area: geo?.area || a.area,
        line1: a.line1 || geo?.line1 || "",
      }));
      toast.success("Current location captured");
    } catch (e) { toast.error(geoErrorMessage(e)); }
    finally { setLocating(false); }
  };

  const currentPhone = user && user !== false ? (user.phone || "") : "";
  const phoneVerified = user && user !== false ? !!user.phone_verified : false;
  const digits = newPhone.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(digits);
  const phoneChanged = ("+91" + digits) !== currentPhone || !phoneVerified;

  useEffect(() => {
    if (user && user !== false) {
      setName(user.name || "");
      setNewPhone((user.phone || "").replace(/^\+91/, ""));
    }
    api.get("/addresses").then(({ data }) => setAddresses(data));
  }, [user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const saveName = async () => {
    try {
      await updateProfile({ name });
      toast.success("Profile updated");
    } catch (e) { toast.error(e.response?.data?.detail || "Error"); }
  };

  const sendOtp = async () => {
    if (!phoneValid) { toast.error("Enter a valid 10-digit Indian mobile number"); return; }
    setSending(true);
    try {
      const { data } = await api.post("/auth/phone/send-otp", { phone: digits });
      if (data.status === "already_verified") {
        toast.info(data.message);
        setOtpStep(false);
        return;
      }
      setOtpStep(true);
      setOtp("");
      setCooldown(30);
      if (data.dev_otp) toast.success(`Dev OTP: ${data.dev_otp}`, { duration: 8000 });
      else toast.success(data.message || "OTP sent");
    } catch (e) { toast.error(e.response?.data?.detail || "Could not send OTP"); }
    finally { setSending(false); }
  };

  const verifyOtp = async () => {
    setVerifying(true);
    try {
      await api.post("/auth/phone/verify-otp", { phone: digits, otp });
      await refresh();
      setOtpStep(false);
      setOtp("");
      toast.success("Mobile number verified");
    } catch (e) { toast.error(e.response?.data?.detail || "Verification failed"); }
    finally { setVerifying(false); }
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
              <div><Label>Name</Label><Input className="mt-1" data-testid="profile-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label>Email</Label><Input className="mt-1" value={user?.email || ""} disabled /></div>
              <Button className="w-fit rounded-full bg-forest" onClick={saveName} data-testid="save-profile">Save changes</Button>

              <div className="mt-2 border-t border-black/5 pt-4">
                <div className="flex items-center justify-between">
                  <Label>Mobile number</Label>
                  {currentPhone ? (
                    phoneVerified ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-forest" data-testid="phone-verified-badge"><ShieldCheck className="h-3.5 w-3.5" />Verified</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600" data-testid="phone-unverified-badge"><ShieldAlert className="h-3.5 w-3.5" />Not verified</span>
                    )
                  ) : null}
                </div>
                {currentPhone && (
                  <p className="mt-1 text-sm text-muted-foreground" data-testid="current-phone">Current: <span className="font-medium text-foreground">{currentPhone}</span></p>
                )}

                <div className="mt-2 flex items-stretch gap-2">
                  <div className="flex items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">+91</div>
                  <Input
                    className="flex-1"
                    data-testid="profile-phone"
                    placeholder="10-digit mobile number"
                    inputMode="numeric"
                    maxLength={10}
                    value={digits}
                    onChange={(e) => { setNewPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setOtpStep(false); }}
                  />
                </div>
                {digits.length > 0 && !phoneValid && (
                  <p className="mt-1 text-xs text-destructive" data-testid="phone-error">Enter a valid 10-digit number starting with 6-9.</p>
                )}

                {!otpStep ? (
                  <Button
                    className="mt-3 w-fit rounded-full bg-forest"
                    disabled={!phoneValid || !phoneChanged || sending}
                    onClick={sendOtp}
                    data-testid="verify-phone-btn"
                  >
                    {sending ? "Sending…" : "Verify Mobile Number"}
                  </Button>
                ) : (
                  <div className="mt-3 rounded-xl border border-black/5 bg-cream/40 p-4" data-testid="otp-section">
                    <Label>Enter OTP sent to +91 {digits}</Label>
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        className="w-40 tracking-[0.4em]"
                        data-testid="otp-input"
                        placeholder="000000"
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      />
                      <Button className="rounded-full bg-forest" disabled={otp.length !== 6 || verifying} onClick={verifyOtp} data-testid="submit-otp-btn">
                        {verifying ? "Verifying…" : "Confirm"}
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        className="font-medium text-forest disabled:text-muted-foreground"
                        disabled={cooldown > 0 || sending}
                        onClick={sendOtp}
                        data-testid="resend-otp-btn"
                      >
                        {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                      </button>
                      <button type="button" className="text-muted-foreground" onClick={() => setOtpStep(false)} data-testid="cancel-otp-btn">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
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
            <Button type="button" variant="outline" className="w-fit rounded-full" onClick={useCurrentLocation} disabled={locating} data-testid="use-current-location-btn">
              <MapPin className="mr-1 h-4 w-4" />{locating ? "Locating…" : "Use current location"}
            </Button>
            {form.latitude != null && <p className="text-xs text-forest" data-testid="coords-captured">Location captured: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</p>}
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
