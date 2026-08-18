import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ShoppingBag, Boxes, BarChart3, Ticket, Users,
  Truck, Settings, LogOut, Store, ChevronDown,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/admin", end: true },
  { icon: ShoppingBag, label: "Orders", to: "/admin/orders" },
  {
    icon: Boxes, label: "Catalog & Inventory", children: [
      { to: "/admin/products", label: "Products" },
      { to: "/admin/categories", label: "Categories" },
      { to: "/admin/subcategories", label: "Subcategories" },
      { to: "/admin/brands", label: "Brands" },
      { to: "/admin/inventory", label: "Inventory" },
      { to: "/admin/packages", label: "Monthly Combos" },
      { to: "/admin/combo-banners", label: "Combo Banners" },
    ],
  },
  { icon: BarChart3, label: "Sales & Analytics", to: "/admin/analytics" },
  {
    icon: Ticket, label: "Coupons & Discounts", children: [
      { to: "/admin/coupons", label: "Coupons" },
      { to: "/admin/campaigns", label: "Personalized Offers" },
    ],
  },
  { icon: Users, label: "Customer Info", to: "/admin/customers" },
  {
    icon: Truck, label: "Delivery Info & Stats", children: [
      { to: "/admin/locations", label: "Locations" },
      { to: "/admin/pincodes", label: "PIN Codes" },
      { to: "/admin/delivery", label: "Delivery & Slots" },
      { to: "/admin/delivery-stats", label: "PIN-wise Stats" },
    ],
  },
  {
    icon: Settings, label: "Personal Settings", children: [
      { to: "/admin/settings", label: "Business Settings" },
      { to: "/admin/payments", label: "Payments" },
    ],
  },
];

function NavGroup({ item, pathname }) {
  const childActive = item.children?.some((c) => pathname.startsWith(c.to));
  const [open, setOpen] = useState(childActive);

  if (!item.children) {
    return (
      <NavLink
        to={item.to}
        end={item.end}
        data-testid={`nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive ? "bg-forest text-white" : "hover:bg-white/5 hover:text-white"
          }`
        }
      >
        <item.icon className="h-4 w-4" /> {item.label}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid={`nav-group-${item.label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          childActive ? "text-white" : "hover:bg-white/5 hover:text-white"
        }`}
      >
        <item.icon className="h-4 w-4" /> {item.label}
        <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
          {item.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              data-testid={`nav-${c.label.toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`}
              className={({ isActive }) =>
                `block rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive ? "bg-forest text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`
              }
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="admin-scope flex min-h-screen bg-slate-100 font-admin">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col bg-slate-900 text-slate-300 lg:flex">
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-4 text-white">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-forest font-bold">F</div>
          <span className="font-semibold">Freshly Admin</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((n) => <NavGroup key={n.label} item={n} pathname={pathname} />)}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button onClick={() => navigate("/")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"><Store className="h-4 w-4" />View Store</button>
          <button onClick={() => { logout(); navigate("/admin/login"); }} data-testid="admin-logout" className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5 hover:text-white"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>

      <div className="flex-1 lg:pl-64">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3 lg:px-8">
          <div className="flex gap-1 overflow-x-auto lg:hidden">
            <NavLink to="/admin" end className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-forest text-white" : "text-slate-600"}`}>Dashboard</NavLink>
            <NavLink to="/admin/orders" className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-forest text-white" : "text-slate-600"}`}>Orders</NavLink>
            <NavLink to="/admin/products" className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-forest text-white" : "text-slate-600"}`}>Catalog</NavLink>
            <NavLink to="/admin/analytics" className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-forest text-white" : "text-slate-600"}`}>Analytics</NavLink>
            <NavLink to="/admin/customers" className={({ isActive }) => `whitespace-nowrap rounded-md px-2 py-1 text-xs ${isActive ? "bg-forest text-white" : "text-slate-600"}`}>Customers</NavLink>
          </div>
          <div className="ml-auto text-sm text-slate-600">{user?.name} · <span className="text-forest">Admin</span></div>
        </header>
        <main className="p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
