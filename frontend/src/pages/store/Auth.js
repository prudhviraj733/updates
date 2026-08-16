import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Auth({ mode = "login" }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const isAdmin = loc.pathname.startsWith("/admin");
  const { login, register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = mode === "login"
      ? await login(form.email, form.password)
      : await register(form);
    setLoading(false);
    if (!res.ok) return setError(res.error);
    toast.success(mode === "login" ? "Welcome back!" : "Account created!");
    if (isAdmin || res.user?.role === "admin") navigate("/admin");
    else navigate("/");
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid min-h-screen bg-cream md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-forest p-12 text-white md:flex">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 font-heading text-xl font-extrabold">F</div>
          <span className="font-heading text-2xl font-extrabold">Freshly</span>
        </Link>
        <div>
          <h2 className="font-heading text-4xl font-extrabold leading-tight">
            {isAdmin ? "Admin Console" : "Fresh groceries, delivered your way."}
          </h2>
          <p className="mt-4 max-w-sm text-white/70">
            {isAdmin ? "Manage products, inventory, orders, delivery slots and more." : "Rice, dals, spices, dry fruits and daily essentials with flexible delivery slots."}
          </p>
        </div>
        <p className="text-sm text-white/50">Multi-location grocery commerce platform</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <h1 className="font-heading text-3xl font-bold">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isAdmin ? "Admin access only" : mode === "login" ? "Welcome back to Freshly" : "Start shopping in minutes"}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" data-testid="name-input" value={form.name} onChange={set("name")} required className="mt-1" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" data-testid="email-input" value={form.email} onChange={set("email")} required className="mt-1" />
            </div>
            {mode === "register" && (
              <div>
                <Label htmlFor="phone">Phone number</Label>
                <Input id="phone" data-testid="phone-input" value={form.phone} onChange={set("phone")} required className="mt-1" />
              </div>
            )}
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" data-testid="password-input" value={form.password} onChange={set("password")} required className="mt-1" />
            </div>

            {error && <p className="text-sm text-destructive" data-testid="auth-error">{error}</p>}

            <Button type="submit" disabled={loading} data-testid="auth-submit" className="w-full rounded-full bg-forest py-6 hover:bg-forest-dark">
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          {!isAdmin && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "login" ? (
                <>New to Freshly? <Link to="/register" className="font-medium text-forest hover:underline">Create account</Link></>
              ) : (
                <>Already have an account? <Link to="/login" className="font-medium text-forest hover:underline">Sign in</Link></>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
