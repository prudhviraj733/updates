import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingBag, BarChart3, Package, Warehouse, Ticket, Users,
  Truck, Gift, Share2, Wallet, Settings, LogOut, Store, Menu,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/admin", end: true, match: ["/admin"] },
  { icon: ShoppingBag, label: "Orders", to: "/admin/orders", match: ["/admin/orders"] },
  { icon: BarChart3, label: "Analytics", to: "/admin/analytics", match: ["/admin/analytics"] },
  {
    icon: Package, label: "Products", to: "/admin/products",
    match: ["/admin/products", "/admin/categories", "/admin/subcategories", "/admin/brands"],
    children: [
      { to: "/admin/products", label: "Catalog" },
      { to: "/admin/categories", label: "Categories" },
      { to: "/admin/subcategories", label: "Subcategories" },
      { to: "/admin/brands", label: "Brands" },
    ],
  },
  { icon: Warehouse, label: "Inventory", to: "/admin/inventory", match: ["/admin/inventory"] },
  {
    icon: Ticket, label: "Coupons & Discounts", to: "/admin/coupons",
    match: ["/admin/coupons", "/admin/campaigns"],
    children: [
      { to: "/admin/coupons", label: "Coupons" },
      { to: "/admin/campaigns", label: "Personalized Coupons" },
    ],
  },
  {
    icon: Users, label: "Customers", to: "/admin/customers",
    match: ["/admin/customers", "/admin/customer-behaviour", "/admin/abandoned-carts"],
    children: [
      { to: "/admin/customers", label: "Customer List & 360" },
      { to: "/admin/customer-behaviour", label: "Customer Behaviour" },
      { to: "/admin/abandoned-carts", label: "Abandoned Carts" },
    ],
  },
  {
    icon: Truck, label: "Delivery / PIN Codes", to: "/admin/pincodes",
    match: ["/admin/pincodes", "/admin/locations", "/admin/delivery", "/admin/delivery-stats"],
    children: [
      { to: "/admin/pincodes", label: "PIN Codes" },
      { to: "/admin/locations", label: "Locations" },
      { to: "/admin/delivery", label: "Delivery Charges & Slots" },
      { to: "/admin/delivery-stats", label: "PIN-wise Statistics" },
    ],
  },
  {
    icon: Gift, label: "Combos & Banners", to: "/admin/packages",
    match: ["/admin/packages", "/admin/combo-banners"],
    children: [
      { to: "/admin/packages", label: "Monthly Combos" },
      { to: "/admin/combo-banners", label: "Combo Banners" },
    ],
  },
  { icon: Share2, label: "Referrals", to: "/admin/referrals", match: ["/admin/referrals"] },
  { icon: Wallet, label: "Wallet", to: "/admin/wallet-management", match: ["/admin/wallet-management"] },
  {
    icon: Settings, label: "Settings", to: "/admin/settings",
    match: ["/admin/settings", "/admin/payments"],
    children: [
      { to: "/admin/settings", label: "Business Settings" },
      { to: "/admin/payments", label: "Payment Settings" },
    ],
  },
];

const tid = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function isSectionActive(item, pathname) {
  if (item.end) return pathname === "/admin";
  return (item.match || [item.to]).some((m) => pathname === m || pathname.startsWith(m + "/"));
}

function SidebarContent({ pathname, onNavigate, navigate, logout, alerts }) {
  const badgeFor = (to) => (to === "/admin/orders" ? alerts?.pending_orders : to === "/admin/inventory" ? alerts?.low_stock : 0) || 0;
  return (
    <>
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4 text-white">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-forest font-bold">F</div>
        <span className="font-semibold">Freshly Admin</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const active = isSectionActive(item, pathname);
          return (
            <div key={item.label}>
              <NavLink
                to={item.to} end={item.end} onClick={onNavigate}
                data-testid={`nav-${tid(item.label)}`}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-forest text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
                {badgeFor(item.to) > 0 && <span data-testid={`nav-badge-${tid(item.label)}`} className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{badgeFor(item.to)}</span>}
              </NavLink>
              {item.children && active && (
                <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                  {item.children.map((c) => (
                    <NavLink
                      key={c.to} to={c.to} end onClick={onNavigate}
                      data-testid={`subnav-${tid(c.label)}`}
                      className={({ isActive }) => `block rounded-md px-3 py-1.5 text-sm transition-colors ${isActive ? "text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"}`}
                    >
                      {c.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button onClick={() => { onNavigate?.(); navigate("/"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><Store className="h-4 w-4" />View Store</button>
        <button onClick={() => { logout(); navigate("/admin/login"); }} data-testid="admin-logout" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [alerts, setAlerts] = useState(null);
  useEffect(() => {
    const load = () => api.get("/admin/dashboard/alerts").then(({ data }) => setAlerts(data)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="admin-scope flex min-h-screen bg-slate-100 font-admin">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-slate-900 text-slate-300 lg:flex" data-testid="admin-sidebar">
        <SidebarContent pathname={pathname} navigate={navigate} logout={logout} alerts={alerts} />
      </aside>

      <div className="flex-1 lg:pl-64">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3 lg:px-8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button className="lg:hidden" data-testid="admin-mobile-menu"><Menu className="h-5 w-5 text-slate-700" /></button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-0 bg-slate-900 p-0 text-slate-300">
              <div className="flex h-full flex-col">
                <SidebarContent pathname={pathname} navigate={navigate} logout={logout} alerts={alerts} onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-semibold text-slate-800 lg:hidden">Freshly Admin</span>
          <div className="ml-auto text-sm text-slate-600">{user?.name} · <span className="text-forest">Admin</span></div>
        </header>
        <main className="p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
