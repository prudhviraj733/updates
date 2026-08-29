import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import api from "@/lib/api";
import { detectPlatform } from "@/lib/platform";

import { AuthProvider } from "@/context/AuthContext";
import { StoreProvider } from "@/context/StoreContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { HelmetProvider } from "react-helmet-async";
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
import Wallet from "@/pages/store/Wallet";
import Referral from "@/pages/store/Referral";
import ComboDetail from "@/pages/store/ComboDetail";
import ReturnFlow from "@/pages/store/ReturnFlow";
import Notifications from "@/pages/store/Notifications";
import { Orders, OrderDetail } from "@/pages/store/Orders";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminCategories from "@/pages/admin/AdminCategories";
import AdminSubcategories from "@/pages/admin/AdminSubcategories";
import AdminSubSubcategories from "@/pages/admin/AdminSubSubcategories";
import AdminBrands from "@/pages/admin/AdminBrands";
import AdminInventory from "@/pages/admin/AdminInventory";
import AdminLocations from "@/pages/admin/AdminLocations";
import AdminPinCodes from "@/pages/admin/AdminPinCodes";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminCustomerDetail from "@/pages/admin/AdminCustomerDetail";
import AdminDelivery from "@/pages/admin/AdminDelivery";
import AdminDeliveryStats from "@/pages/admin/AdminDeliveryStats";
import AdminAnalytics from "@/pages/admin/AdminAnalytics";
import AdminProfit from "@/pages/admin/AdminProfit";
import AdminCoupons from "@/pages/admin/AdminCoupons";
import AdminCouponStats from "@/pages/admin/AdminCouponStats";
import AdminPackages from "@/pages/admin/AdminPackages";
import AdminComboBanners from "@/pages/admin/AdminComboBanners";
import AdminCampaigns from "@/pages/admin/AdminCampaigns";
import AdminWalletManagement from "@/pages/admin/AdminWalletManagement";
import AdminAbandonedCarts from "@/pages/admin/AdminAbandonedCarts";
import AdminCustomerBehaviour from "@/pages/admin/AdminCustomerBehaviour";
import AdminPayments from "@/pages/admin/AdminPayments";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminReferrals from "@/pages/admin/AdminReferrals";
import AdminReturns from "@/pages/admin/AdminReturns";
import AdminNotifications from "@/pages/admin/AdminNotifications";

function App() {
  useEffect(() => {
    try {
      const p = detectPlatform();
      const key = `tracked:${p}:${new Date().toISOString().slice(0, 10)}`;
      if (!localStorage.getItem(key)) {
        api.post("/usage/track").then(() => localStorage.setItem(key, "1")).catch(() => {});
      }
    } catch (e) { /* noop */ }
  }, []);
  return (
    <div className="App">
      <HelmetProvider>
      <AuthProvider>
        <StoreProvider>
          <NotificationProvider>
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
                <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
                <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
                <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
                <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
                <Route path="/orders/:id" element={<ProtectedRoute><OrderDetail /></ProtectedRoute>} />
                <Route path="/orders/:id/return" element={<ProtectedRoute><ReturnFlow /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              </Route>

              {/* Admin */}
              <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminDashboard />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="returns" element={<AdminReturns />} />
                <Route path="notifications" element={<AdminNotifications />} />
                <Route path="orders/:id" element={<AdminOrderDetail />} />
                <Route path="products" element={<AdminProducts />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="subcategories" element={<AdminSubcategories />} />
                <Route path="subsubcategories" element={<AdminSubSubcategories />} />
                <Route path="brands" element={<AdminBrands />} />
                <Route path="inventory" element={<AdminInventory />} />
                <Route path="locations" element={<AdminLocations />} />
                <Route path="pincodes" element={<AdminPinCodes />} />
                <Route path="delivery" element={<AdminDelivery />} />
                <Route path="delivery-stats" element={<AdminDeliveryStats />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="profit" element={<AdminProfit />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="coupons/:id/stats" element={<AdminCouponStats />} />
                <Route path="packages" element={<AdminPackages />} />
                <Route path="combo-banners" element={<AdminComboBanners />} />
                <Route path="campaigns" element={<AdminCampaigns />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="customers/:id" element={<AdminCustomerDetail />} />
                <Route path="customer-behaviour" element={<AdminCustomerBehaviour />} />
                <Route path="abandoned-carts" element={<AdminAbandonedCarts />} />
                <Route path="wallet-management" element={<AdminWalletManagement />} />
                <Route path="referrals" element={<AdminReferrals />} />
                <Route path="payments" element={<AdminPayments />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          </NotificationProvider>
        </StoreProvider>
      </AuthProvider>
      </HelmetProvider>
    </div>
  );
}

export default App;
