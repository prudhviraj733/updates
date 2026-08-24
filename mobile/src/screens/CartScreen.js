import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { inr } from "../api/client";
import { useStore } from "../context/StoreContext";
import { EmptyState, PrimaryButton } from "../components/ui";
import { colors } from "../theme";

export default function CartScreen() {
  const nav = useNavigation();
  const { cart, updateQty, removeItem, deliveryInfo, pincode } = useStore();
  const items = cart.items || [];
  const subtotal = cart.subtotal || items.reduce((s, i) => s + (i.price || i.selling_price || 0) * i.quantity, 0);

  if (items.length === 0) {
    return <EmptyState icon="cart-outline" title="Your cart is empty" subtitle="Add products to get started" />;
  }

  const belowMin = deliveryInfo?.min_order_value && subtotal < deliveryInfo.min_order_value;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.product_id || i.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Image source={{ uri: item.image || item.images?.[0] }} style={styles.img} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={2} style={styles.name}>{item.name}</Text>
              <Text style={styles.pack}>{item.pack_size} {item.unit}</Text>
              <Text style={styles.price}>{inr(item.price || item.selling_price)}</Text>
            </View>
            <View style={styles.stepper}>
              <TouchableOpacity onPress={() => updateQty(item.product_id, item.quantity - 1)}><Ionicons name="remove" size={18} color="#fff" /></TouchableOpacity>
              <Text style={styles.qty}>{item.quantity}</Text>
              <TouchableOpacity onPress={() => updateQty(item.product_id, item.quantity + 1)}><Ionicons name="add" size={18} color="#fff" /></TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={{ padding: 12 }}
      />
      <View style={styles.footer}>
        <View style={styles.sumRow}><Text style={styles.sumLabel}>Subtotal</Text><Text style={styles.sumVal}>{inr(subtotal)}</Text></View>
        <Text style={styles.note}>Delivery charges shown at checkout based on your PIN code</Text>
        {belowMin ? (
          <Text style={styles.warn}>Minimum order value is {inr(deliveryInfo.min_order_value)}</Text>
        ) : null}
        <PrimaryButton title={`Proceed to Checkout · ${inr(subtotal)}`} disabled={!pincode || belowMin} onPress={() => nav.navigate("Checkout")} testID="cart-checkout" style={{ marginTop: 10 }} />
        {!pincode ? <Text style={styles.warn}>Set your delivery PIN code on Home first</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, backgroundColor: "#fff", borderRadius: 14, padding: 10, marginBottom: 10, alignItems: "center" },
  img: { width: 60, height: 60, borderRadius: 10, backgroundColor: colors.bg },
  name: { fontWeight: "600", color: colors.text },
  pack: { fontSize: 12, color: colors.muted },
  price: { fontWeight: "800", color: colors.forest, marginTop: 2 },
  stepper: { backgroundColor: colors.forest, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 6 },
  qty: { color: "#fff", fontWeight: "800", minWidth: 18, textAlign: "center" },
  footer: { backgroundColor: "#fff", padding: 16, borderTopWidth: 1, borderTopColor: colors.border },
  sumRow: { flexDirection: "row", justifyContent: "space-between" },
  sumLabel: { color: colors.muted }, sumVal: { fontWeight: "800", color: colors.text },
  note: { fontSize: 11, color: colors.muted, marginTop: 4 },
  warn: { color: colors.danger, fontSize: 12, marginTop: 6, textAlign: "center" },
});
