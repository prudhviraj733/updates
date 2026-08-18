import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search, ShoppingCart, MapPin, User, ChevronDown, Menu, Heart, Package, Ticket, Wallet, Gift } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { location, setLocationModalOpen, cart, setCartOpen } = useStore();
  const [q, setQ] = useState("");

  const submitSearch = (e) => {
    e.preventDefault();
    navigate(`/products?search=${encodeURIComponent(q)}`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2" data-testid="logo-link">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-forest text-white font-heading font-extrabold">F</div>
          <span className="hidden font-heading text-xl font-extrabold text-forest sm:block">Freshly</span>
        </Link>

        <button
          data-testid="location-selector"
          onClick={() => setLocationModalOpen(true)}
          className="flex items-center gap-2 rounded-full border border-border bg-white px-3 py-2 text-left transition-colors hover:border-forest/40"
        >
          <MapPin className="h-4 w-4 text-forest" />
          <div className="hidden sm:block">
            <p className="text-[10px] uppercase leading-none text-muted-foreground">Deliver to</p>
            <p className="max-w-[120px] truncate text-sm font-medium leading-tight">
              {location ? location.area : "Select area"}
            </p>
          </div>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>

        <form onSubmit={submitSearch} className="relative hidden flex-1 md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search for rice, dal, spices, dry fruits…"
            className="rounded-full pl-10"
          />
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" className="hidden rounded-full text-sm font-medium sm:flex" onClick={() => navigate("/offers")} data-testid="offers-nav">
            <Ticket className="mr-1 h-4 w-4 text-saffron" /> Offers
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" onClick={() => navigate("/wishlist")} data-testid="wishlist-nav">
            <Heart className="h-5 w-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" data-testid="account-menu">
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {user && user !== false ? (
                <>
                  <div className="px-2 py-1.5 text-sm">
                    <p className="font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/account")} data-testid="menu-account"><User className="mr-2 h-4 w-4" />My Account</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/orders")} data-testid="menu-orders"><Package className="mr-2 h-4 w-4" />My Orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/my-coupons")} data-testid="menu-coupons"><Ticket className="mr-2 h-4 w-4" />My Coupons</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/wallet")} data-testid="menu-wallet"><Wallet className="mr-2 h-4 w-4" />My Wallet</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/referral")} data-testid="menu-referral"><Gift className="mr-2 h-4 w-4" />Refer &amp; Earn</DropdownMenuItem>
                  {user.role === "admin" && (
                    <DropdownMenuItem onClick={() => navigate("/admin")} data-testid="menu-admin">Admin Dashboard</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} data-testid="menu-logout">Sign out</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => navigate("/login")} data-testid="menu-login">Sign in</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/register")} data-testid="menu-register">Create account</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            data-testid="cart-button"
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-white hover:bg-forest-dark"
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden text-sm font-semibold sm:block">Cart</span>
            {cart.count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-saffron text-[11px] font-bold text-white" data-testid="cart-count">
                {cart.count}
              </span>
            )}
          </button>
        </div>
      </div>

      <form onSubmit={submitSearch} className="relative px-4 pb-3 md:hidden">
        <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groceries…" className="rounded-full pl-10" data-testid="search-input-mobile" />
      </form>
    </header>
  );
}
