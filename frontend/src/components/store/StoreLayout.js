import { Outlet } from "react-router-dom";
import { Header } from "@/components/store/Header";
import { Footer } from "@/components/store/Footer";
import { CartDrawer } from "@/components/store/CartDrawer";
import { LocationModal } from "@/components/store/LocationModal";

export function StoreLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <LocationModal />
    </div>
  );
}
