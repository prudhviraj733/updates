import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { StoreProvider } from "@/context/StoreContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { StoreLayout } from "@/components/store/StoreLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";

import Home from "@/pages/store/Home";
import Products from "@/pages/store/Products";
import ProductDetail from "@/pages/store/ProductDetail";
import Auth from "@/pages/store/Auth";
import Checkout from "@/pages/store/Checkout";
import Account from "@/pages/store/Account";
import Wishlist from "@/pages/store/Wishlist";
import Offers from "@/pages/store/Offers";
import MyCoupons from "@/pages/store/MyCoupons";
import ComboDetail from "@/pages/store/ComboDetail";
import { Orders, OrderDetail } from "@/pages/store/Orders";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminInventory from "@/pages/admin/AdminInventory";
import AdminLocations from "@/pages/admin/AdminLocations";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminDelivery from "@/pages/admin/AdminDelivery";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminPackages from "@/pages/admin/AdminPackages";
import AdminComboBanners from "@/pages/admin/AdminComboBanners";
import AdminCampaigns from "@/pages/admin/AdminCampaigns";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminSettings from "@/pages/admin/AdminSettings";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <StoreProvider>
          <BrowserRouter>
            <Toaster position="top-center" richColors />
            <Routes>
              {/* Auth */}
              <Route path="/login" element={<Auth mode="login" />} />
              <Route path="/register" element={<Auth mode="register" />} />
              <Route path="/admin/login" element={<Auth mode="login" />} />

              {/* Storefront */}
              <Route element={<StoreLayout />}>
                <Route path="/" element={<Home />} />
                <Route path="/products" element={<Products />} />
                <Route path="/product/:id" element={<ProductDetail />} />
                <Route path="/combo/:id" element={<ComboDetail />} />
                <Route path="/wishlist" element={<Wishlist />} />
                <Route path="/offers" element={<Offers />} />
                <Route path="/my-coupons" element={<ProtectedRoute><MyCoupons /></ProtectedRoute>} />
                <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
                <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
                <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              </Route>

              {/* Admin */}
              <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="inventory" element={<AdminInventory />} />
                <Route path="locations" element={<AdminLocations />} />
                <Route path="delivery" element={<AdminDelivery />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="packages" element={<AdminPackages />} />
                <Route path="combo-banners" element={<AdminComboBanners />} />
                <Route path="campaigns" element={<AdminCampaigns />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </StoreProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
