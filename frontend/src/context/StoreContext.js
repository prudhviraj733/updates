import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [location, setLocationState] = useState(null);
  const [pincode, setPincodeState] = useState(localStorage.getItem("pincode") || null);
  const [cart, setCart] = useState({ items: [], combos: [], subtotal: 0, count: 0 });
  const [wishlist, setWishlist] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  useEffect(() => {
    api.get("/locations").then(({ data }) => {
      setLocations(data);
      const savedLoc = localStorage.getItem("location_id");
      const savedPin = localStorage.getItem("pincode");
      const found = data.find((l) => l.id === savedLoc) || data[0];
      if (found) {
        setLocationState(found);
        localStorage.setItem("location_id", found.id);
        const pins = found.pincodes || [];
        const pin = (savedPin && pins.includes(savedPin)) ? savedPin : (pins[0] || null);
        setPincodeState(pin || null);
        if (pin) localStorage.setItem("pincode", pin); else localStorage.removeItem("pincode");
      } else {
        setLocationModalOpen(true);
      }
    });
  }, []);

  const setLocation = (loc, pin = null) => {
    setLocationState(loc);
    localStorage.setItem("location_id", loc.id);
    const resolved = pin !== null ? pin : ((loc.pincodes && loc.pincodes[0]) || null);
    setPincodeState(resolved || null);
    if (resolved) localStorage.setItem("pincode", resolved); else localStorage.removeItem("pincode");
    setLocationModalOpen(false);
  };
  const setPincode = (pin) => {
    setPincodeState(pin || null);
    if (pin) localStorage.setItem("pincode", pin); else localStorage.removeItem("pincode");
  };

  const refreshCart = useCallback(async () => {
    if (!user || user === false || !location) {
      setCart({ items: [], combos: [], subtotal: 0, count: 0 });
      return;
    }
    try {
      const { data } = await api.get(`/cart?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`);
      setCart(data);
    } catch {}
  }, [user, location, pincode]);

  const addCombo = async (comboId, selections) => {
    if (!requireAuth()) return false;
    try {
      const { data } = await api.post("/cart/combo", { location_id: location.id, pincode, combo_id: comboId, selections });
      setCart(data);
      return true;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add combo");
      return false;
    }
  };

  const updateCombo = async (lineId, selections) => {
    try {
      const { data } = await api.put(`/cart/combo/${lineId}`, { location_id: location.id, pincode, selections });
      setCart(data);
      return true;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update combo");
      return false;
    }
  };

  const removeCombo = async (lineId) => {
    const { data } = await api.delete(`/cart/combo/${lineId}?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`);
    setCart(data);
  };

  const refreshWishlist = useCallback(async () => {
    if (!user || user === false) {
      setWishlist([]);
      return;
    }
    try {
      const { data } = await api.get("/wishlist");
      setWishlist(data.map((p) => p.id));
    } catch {}
  }, [user]);

  useEffect(() => {
    refreshCart();
    refreshWishlist();
  }, [refreshCart, refreshWishlist]);

  const requireAuth = () => {
    if (!user || user === false) {
      toast.error("Please sign in to continue");
      return false;
    }
    return true;
  };

  const addToCart = async (product, qty = 1) => {
    if (!requireAuth()) return false;
    try {
      const { data } = await api.post("/cart/items", {
        product_id: product.id,
        location_id: location.id,
        pincode,
        quantity: qty,
      });
      setCart(data);
      toast.success(`${product.name} added to cart`);
      return true;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add to cart");
      return false;
    }
  };

  const updateQty = async (productId, quantity) => {
    try {
      const { data } = await api.put(`/cart/items/${productId}`, {
        location_id: location.id,
        pincode,
        quantity,
      });
      setCart(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not update quantity");
    }
  };

  const removeItem = async (productId) => {
    const { data } = await api.delete(`/cart/items/${productId}?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`);
    setCart(data);
  };

  const clearCart = async () => {
    if (!location) return;
    const { data } = await api.delete(`/cart?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`);
    setCart(data);
  };

  const toggleWishlist = async (productId) => {
    if (!requireAuth()) return;
    if (wishlist.includes(productId)) {
      setWishlist((w) => w.filter((id) => id !== productId));
      await api.delete(`/wishlist/${productId}`);
    } else {
      setWishlist((w) => [...w, productId]);
      await api.post(`/wishlist/${productId}`);
      toast.success("Added to wishlist");
    }
  };

  return (
    <StoreContext.Provider
      value={{
        locations, location, setLocation, pincode, setPincode,
        cart, refreshCart, addToCart, updateQty, removeItem, clearCart,
        addCombo, updateCombo, removeCombo,
        wishlist, toggleWishlist, refreshWishlist,
        cartOpen, setCartOpen,
        locationModalOpen, setLocationModalOpen,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);
