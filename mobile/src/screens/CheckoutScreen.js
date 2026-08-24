import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import api, { inr, apiError } from "../api/client";
import { useStore } from "../context/StoreContext";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton, Loading } from "../components/ui";
import { colors } from "../theme";

export default function CheckoutScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const { location, pincode, deliveryInfo, cart, clearCart } = useStore();
  const [addresses, setAddresses] = useState([]);
  const [addressId, setAddressId] = useState(null);
  const [days, setDays] = useState([]);
  const [slotId, setSlotId] = useState(null);
  const [deliveryType, setDeliveryType] = useState("slot");
  const [payment, setPayment] = useState("cod");
  const [payConfig, setPayConfig] = useState({ razorpay_enabled: false });
  const [coupon, setCoupon] = useState("");
  const [placing, setPlacing] = useState(false);
  const [loading, setLoading] = useState(true);

  const expressEnabled = !!deliveryInfo?.express_enabled;
  const subtotal = cart.subtotal || (cart.items || []).reduce((s, i) => s + (i.price || i.selling_price || 0) * i.quantity, 0);
  const deliveryCharge = deliveryType === "express" ? (deliveryInfo?.express_charge || 0) : (deliveryInfo?.delivery_charge || 0);
  const estTotal = subtotal + deliveryCharge;

  const loadAddresses = useCallback(async () => {
    try { const { data } = await api.get("/addresses"); setAddresses(data || []);
      const def = (data || []).find((a) => a.is_default) || data?.[0];
      if (def && !addressId) setAddressId(def.id);
    } catch { /* noop */ }
  }, [addressId]);

  useFocusEffect(useCallback(() => { loadAddresses(); }, [loadAddresses]));

  useEffect(() => {
    if (!location) return;
    (async () => {
      try {
        const [slots, cfg] = await Promise.all([
          api.get(`/delivery/slots/range?location_id=${location.id}`),
          api.get("/payments/config"),
        ]);
        setDays(slots.data?.days || []);
        setPayConfig(cfg.data || { razorpay_enabled: false });
      } catch { /* noop */ } finally { setLoading(false); }
    })();
  }, [location]);

  useEffect(() => { if (!expressEnabled && deliveryType === "express") setDeliveryType("slot"); }, [expressEnabled, deliveryType]);

  const placeOrder = async () => {
    if (!addressId) return Alert.alert("Address needed", "Please select or add a delivery address");
    if (deliveryType === "slot" && !slotId) return Alert.alert("Slot needed", "Please select a delivery slot");
    setPlacing(true);
    try {
      const { data: order } = await api.post("/orders", {
        location_id: location.id,
        address_id: addressId,
        delivery_type: deliveryType,
        slot_id: deliveryType === "slot" ? slotId : null,
        payment_method: payment,
        coupon_code: coupon.trim() || null,
        delivery_coupon_code: null,
        use_wallet: false,
      });

      if (payment === "razorpay") {
        const { data: rzp } = await api.post("/payments/razorpay/create-order", { order_id: order.id });
        nav.replace("Razorpay", { order, rzp, contact: (order.customer_phone || "").replace(/\D/g, "").slice(-10), email: user?.email });
        return;
      }
      await clearCart();
      Alert.alert("Order placed", `Your order ${order.order_number} is confirmed.`);
      nav.replace("OrderDetail", { id: order.id });
    } catch (e) {
      Alert.alert("Could not place order", apiError(e));
    } finally { setPlacing(false); }
  };

  if (loading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
        <Text style={styles.h}>Delivery Address</Text>
        {addresses.map((a) => (
          <TouchableOpacity key={a.id} style={[styles.opt, addressId === a.id && styles.optActive]} onPress={() => setAddressId(a.id)} testID={`addr-${a.id}`}>
            <Ionicons name={addressId === a.id ? "radio-button-on" : "radio-button-off"} size={20} color={colors.forest} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optTitle}>{a.label || a.full_name}</Text>
              <Text style={styles.optSub}>{a.line1}, {a.area}, {a.city} - {a.pincode}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.add} onPress={() => nav.navigate("AddressForm", { onSaved: loadAddresses })} testID="add-address">
          <Ionicons name="add" size={18} color={colors.forest} /><Text style={{ color: colors.forest, fontWeight: "700" }}>Add new address</Text>
        </TouchableOpacity>

        <Text style={styles.h}>Delivery Option</Text>
        <TouchableOpacity style={[styles.opt, deliveryType === "slot" && styles.optActive]} onPress={() => setDeliveryType("slot")} testID="delivery-slot">
          <Ionicons name={deliveryType === "slot" ? "radio-button-on" : "radio-button-off"} size={20} color={colors.forest} />
          <View style={{ flex: 1 }}><Text style={styles.optTitle}>Scheduled Slot</Text><Text style={styles.optSub}>+{inr(deliveryInfo?.delivery_charge || 0)} delivery</Text></View>
        </TouchableOpacity>
        {expressEnabled && (
          <TouchableOpacity style={[styles.opt, deliveryType === "express" && styles.optActive]} onPress={() => setDeliveryType("express")} testID="delivery-express-option">
            <Ionicons name={deliveryType === "express" ? "radio-button-on" : "radio-button-off"} size={20} color={colors.saffron} />
            <View style={{ flex: 1 }}><Text style={[styles.optTitle, { color: colors.saffron }]}>⚡ Get in 30 Minutes</Text><Text style={styles.optSub}>Express delivery · +{inr(deliveryInfo?.express_charge || 0)}</Text></View>
          </TouchableOpacity>
        )}

        {deliveryType === "slot" && (
          <View>
            {(days || []).map((d) => (
              <View key={d.date}>
                <Text style={styles.dayLabel}>{d.label || d.date}</Text>
                <View style={styles.slotWrap}>
                  {(d.slots || []).map((s) => (
                    <TouchableOpacity key={s.id} disabled={s.available === false} style={[styles.slot, slotId === s.id && styles.slotActive, s.available === false && { opacity: 0.4 }]} onPress={() => setSlotId(s.id)} testID={`slot-${s.id}`}>
                      <Text style={[styles.slotText, slotId === s.id && { color: "#fff" }]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.h}>Coupon (optional)</Text>
        <TextInput style={styles.input} placeholder="Enter coupon code" autoCapitalize="characters" value={coupon} onChangeText={setCoupon} testID="coupon-input" />

        <Text style={styles.h}>Payment Method</Text>
        <TouchableOpacity style={[styles.opt, payment === "cod" && styles.optActive]} onPress={() => setPayment("cod")} testID="pay-cod">
          <Ionicons name={payment === "cod" ? "radio-button-on" : "radio-button-off"} size={20} color={colors.forest} />
          <Text style={styles.optTitle}>Cash on Delivery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.opt, payment === "razorpay" && styles.optActive, !payConfig.razorpay_enabled && { opacity: 0.6 }]} onPress={() => payConfig.razorpay_enabled ? setPayment("razorpay") : Alert.alert("Unavailable", "Online payment is not configured yet")} testID="pay-razorpay">
          <Ionicons name={payment === "razorpay" ? "radio-button-on" : "radio-button-off"} size={20} color={colors.forest} />
          <View style={{ flex: 1 }}><Text style={styles.optTitle}>Pay Online (Razorpay)</Text><Text style={styles.optSub}>UPI, cards, netbanking & wallets</Text></View>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.sumRow}><Text style={styles.sumLabel}>Subtotal</Text><Text style={styles.sumVal}>{inr(subtotal)}</Text></View>
        <View style={styles.sumRow}><Text style={styles.sumLabel}>Delivery</Text><Text style={styles.sumVal}>{inr(deliveryCharge)}</Text></View>
        <View style={styles.sumRow}><Text style={[styles.sumLabel, { fontWeight: "800", color: colors.text }]}>Estimated total</Text><Text style={[styles.sumVal, { fontSize: 16 }]}>{inr(estTotal)}</Text></View>
        <PrimaryButton title={payment === "razorpay" ? `Pay ${inr(estTotal)}` : `Place Order · ${inr(estTotal)}`} loading={placing} onPress={placeOrder} testID="place-order" style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 16, marginBottom: 8 },
  opt: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: colors.border, marginBottom: 8 },
  optActive: { borderColor: colors.forest, backgroundColor: colors.forestLight },
  optTitle: { fontWeight: "700", color: colors.text },
  optSub: { fontSize: 12, color: colors.muted },
  add: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  dayLabel: { fontWeight: "700", color: colors.text, marginTop: 8, marginBottom: 6 },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slot: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#fff" },
  slotActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  slotText: { color: colors.text, fontSize: 13 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff" },
  footer: { backgroundColor: "#fff", padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  sumRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  sumLabel: { color: colors.muted }, sumVal: { fontWeight: "700", color: colors.text },
});
