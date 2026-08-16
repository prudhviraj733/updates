import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Package, Tags, Boxes, MapPin, ShoppingBag, Users,
  Truck, Clock, Ticket, CreditCard, Settings, LogOut, Store, Gift,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/admin", end: true, icon: LayoutDashboard, label: "Dashboard" },
  { to: "/admin/orders", icon: ShoppingBag, label: "Orders" },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/categories", icon: Tags, label: "Categories" },
  { to: "/admin/inventory", icon: Boxes, label: "Inventory" },
  { to: "/admin/locations", icon: MapPin, label: "Locations" },
  { to: "/admin/delivery", icon: Truck, label: "Delivery & Slots" },
  { to: "/admin/coupons", icon: Ticket, label: "Coupons" },
  { to: "/admin/packages", icon: Gift, label: "Packages" },
  { to: "/admin/customers", icon: Users, label: "Customers" },
  { to: "/admin/payments", icon: CreditCard, label: "Payments" },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-scope flex min-h-screen bg-slate-100 font-admin">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-slate-900 text-slate-300 lg:flex">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4 text-white">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-forest font-bold">F</div>
          <span className="font-semibold">Freshly Admin</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`nav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-forest text-white" : "hover:bg-white/5 hover:text-white"
                }`
              }
            >
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button onClick={() => navigate("/")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"><Store className="h-4 w-4" />View Store</button>
          <button onClick={() => { logout(); navigate("/admin/login"); }} data-testid="admin-logout" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>

      <div className="flex-1 lg:pl-60">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 lg:px-8">
          <div className="flex gap-1 overflow-x-auto lg:hidden">
            {NAV.slice(0, 6).map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-forest text-white" : "text-slate-600"}`}>{n.label}</NavLink>
            ))}
          </div>
          <div className="ml-auto text-sm text-slate-600">{user?.name} · <span className="text-forest">Admin</span></div>
        </header>
        <main className="p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
