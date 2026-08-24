import { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../api/client";
import { useAuth } from "./AuthContext";

const StoreContext = createContext(null);
const emptyCart = { items: [], subtotal: 0 };

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [location, setLocationState] = useState(null);
  const [pincode, setPincodeState] = useState(null);
  const [deliveryInfo, setDeliveryInfo] = useState(null);
  const [cart, setCart] = useState(emptyCart);

  useEffect(() => {
    api.get("/locations").then(async ({ data }) => {
      setLocations(data);
      const savedLoc = await AsyncStorage.getItem("location_id");
      const savedPin = await AsyncStorage.getItem("pincode");
      const found = data.find((l) => l.id === savedLoc) || data[0];
      if (found) { setLocationState(found); await AsyncStorage.setItem("location_id", found.id); }
      if (savedPin) setPincodeState(savedPin);
    }).catch(() => {});
  }, []);

  const setLocation = async (loc) => {
    setLocationState(loc);
    if (loc) await AsyncStorage.setItem("location_id", loc.id);
  };

  const setPincode = async (pin) => {
    setPincodeState(pin);
    if (pin) await AsyncStorage.setItem("pincode", pin);
  };

  // Resolve serviceability + per-PIN charges + Get-in-30 availability.
  useEffect(() => {
    if (!pincode) { setDeliveryInfo(null); return; }
    api.get(`/pincodes/check?pincode=${pincode}`).then(({ data }) => setDeliveryInfo(data)).catch(() => setDeliveryInfo(null));
  }, [pincode]);

  const qs = useCallback(() => {
    if (!location) return "";
    return `location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`;
  }, [location, pincode]);

  const refreshCart = useCallback(async () => {
    if (!location || !user || user === false) { setCart(emptyCart); return; }
    try { const { data } = await api.get(`/cart?${qs()}`); setCart(data || emptyCart); }
    catch { /* noop */ }
  }, [location, pincode, user, qs]);

  useEffect(() => { refreshCart(); }, [refreshCart]);

  const addToCart = async (product, quantity = 1) => {
    await api.post("/cart/items", { product_id: product.id, location_id: location.id, pincode, quantity });
    await refreshCart();
  };
  const updateQty = async (productId, quantity) => {
    if (quantity <= 0) return removeItem(productId);
    await api.put(`/cart/items/${productId}`, { quantity, location_id: location.id, pincode });
    await refreshCart();
  };
  const removeItem = async (productId) => {
    await api.delete(`/cart/items/${productId}?${qs()}`);
    await refreshCart();
  };
  const clearCart = async () => {
    await api.delete(`/cart?${qs()}`).catch(() => {});
    setCart(emptyCart);
  };

  const cartCount = (cart.items || []).reduce((n, i) => n + (i.quantity || 0), 0);

  return (
    <StoreContext.Provider
      value={{
        locations, location, setLocation,
        pincode, setPincode, deliveryInfo,
        cart, cartCount, refreshCart, addToCart, updateQty, removeItem, clearCart,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);
