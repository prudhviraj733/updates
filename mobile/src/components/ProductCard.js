import { View, Text, Image, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { inr } from "../api/client";
import { useStore } from "../context/StoreContext";
import { colors } from "../theme";

export function ProductCard({ product, onPress }) {
  const { cart, addToCart, updateQty } = useStore();
  const inCart = (cart.items || []).find((i) => i.product_id === product.id);
  const out = product.in_stock === false || product.stock === 0;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress} testID={`product-${product.id}`}>
      <View style={styles.imgWrap}>
        {product.discount_percent > 0 && (
          <View style={styles.badge}><Text style={styles.badgeText}>{product.discount_percent}% OFF</Text></View>
        )}
        <Image source={{ uri: product.images?.[0] }} style={styles.img} resizeMode="cover" />
      </View>
      <Text numberOfLines={2} style={styles.name}>{product.name}</Text>
      <Text style={styles.pack}>{product.pack_size} {product.unit}</Text>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{inr(product.selling_price)}</Text>
        {product.mrp > product.selling_price && <Text style={styles.mrp}>{inr(product.mrp)}</Text>}
      </View>

      {out ? (
        <View style={[styles.addBtn, { backgroundColor: colors.border }]}><Text style={styles.outText}>Out of stock</Text></View>
      ) : inCart ? (
        <View style={styles.stepper}>
          <TouchableOpacity onPress={() => updateQty(product.id, inCart.quantity - 1)} testID={`dec-${product.id}`}><Ionicons name="remove" size={18} color="#fff" /></TouchableOpacity>
          <Text style={styles.qty} testID={`qty-${product.id}`}>{inCart.quantity}</Text>
          <TouchableOpacity onPress={() => updateQty(product.id, inCart.quantity + 1)} testID={`inc-${product.id}`}><Ionicons name="add" size={18} color="#fff" /></TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(product)} testID={`add-${product.id}`}>
          <Text style={styles.addText}>ADD</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: "#fff", borderRadius: 16, padding: 10, margin: 6, borderWidth: 1, borderColor: colors.border },
  imgWrap: { position: "relative" },
  img: { width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: colors.bg },
  badge: { position: "absolute", top: 6, left: 6, backgroundColor: colors.saffron, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, zIndex: 2 },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  name: { marginTop: 8, fontSize: 13, fontWeight: "600", color: colors.text, minHeight: 34 },
  pack: { fontSize: 11, color: colors.muted },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  price: { fontSize: 15, fontWeight: "800", color: colors.forest },
  mrp: { fontSize: 12, color: colors.muted, textDecorationLine: "line-through" },
  addBtn: { marginTop: 8, borderWidth: 1.5, borderColor: colors.forest, borderRadius: 999, paddingVertical: 7, alignItems: "center" },
  addText: { color: colors.forest, fontWeight: "800" },
  outText: { color: colors.muted, fontWeight: "700", fontSize: 12 },
  stepper: { marginTop: 8, backgroundColor: colors.forest, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 6 },
  qty: { color: "#fff", fontWeight: "800" },
});
