import { useEffect, useState } from "react";
import { View, Text, Image, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import api, { inr } from "../api/client";
import { useStore } from "../context/StoreContext";
import { Loading, PrimaryButton } from "../components/ui";
import { colors } from "../theme";

export default function ProductDetailScreen() {
  const { id } = useRoute().params;
  const nav = useNavigation();
  const { location, cart, addToCart, updateQty } = useStore();
  const [product, setProduct] = useState(null);

  useEffect(() => {
    if (!location) return;
    api.get(`/products/${id}?location_id=${location.id}`).then(({ data }) => setProduct(data)).catch(() => {});
  }, [id, location]);

  if (!product) return <Loading />;
  const inCart = (cart.items || []).find((i) => i.product_id === product.id);
  const out = product.in_stock === false || product.stock === 0;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <ScrollView>
        <Image source={{ uri: product.images?.[0] }} style={styles.img} resizeMode="cover" />
        <View style={{ padding: 16 }}>
          <Text style={styles.pack}>{product.pack_size} {product.unit}</Text>
          <Text style={styles.name}>{product.name}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{inr(product.selling_price)}</Text>
            {product.mrp > product.selling_price && <Text style={styles.mrp}>{inr(product.mrp)}</Text>}
            {product.discount_percent > 0 && <Text style={styles.save}>Save {product.discount_percent}%</Text>}
          </View>
          <Text style={[styles.stock, { color: out ? colors.danger : colors.forest }]}>{out ? "Out of stock" : product.stock <= 10 ? `Only ${product.stock} left` : "In stock"}</Text>
          {product.description ? <Text style={styles.desc}>{product.description}</Text> : null}
          <View style={styles.info}><Ionicons name="cube-outline" size={18} color={colors.forest} /><Text style={styles.infoText}>Slot-based & Get in 30 Minutes delivery available</Text></View>
          <View style={styles.info}><Ionicons name="shield-checkmark-outline" size={18} color={colors.forest} /><Text style={styles.infoText}>Quality checked & securely packed</Text></View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {out ? (
          <View style={[styles.disabled]}><Text style={{ color: colors.muted, fontWeight: "700" }}>Out of Stock</Text></View>
        ) : inCart ? (
          <View style={styles.stepper}>
            <TouchableOpacity onPress={() => updateQty(product.id, inCart.quantity - 1)}><Ionicons name="remove" size={22} color="#fff" /></TouchableOpacity>
            <Text style={styles.qty}>{inCart.quantity} in cart</Text>
            <TouchableOpacity onPress={() => updateQty(product.id, inCart.quantity + 1)}><Ionicons name="add" size={22} color="#fff" /></TouchableOpacity>
          </View>
        ) : (
          <PrimaryButton title="Add to Cart" onPress={() => addToCart(product)} testID="detail-add" style={{ flex: 1 }} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  img: { width: "100%", aspectRatio: 1, backgroundColor: colors.bg },
  pack: { color: colors.muted, textTransform: "uppercase", fontSize: 12 },
  name: { fontSize: 24, fontWeight: "800", color: colors.text, marginTop: 4 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  price: { fontSize: 24, fontWeight: "900", color: colors.forest },
  mrp: { fontSize: 16, color: colors.muted, textDecorationLine: "line-through" },
  save: { color: colors.saffron, fontWeight: "700" },
  stock: { marginTop: 6, fontWeight: "700" },
  desc: { marginTop: 14, color: colors.muted, lineHeight: 21 },
  info: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  infoText: { color: colors.text, fontSize: 13, flex: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#fff" },
  disabled: { backgroundColor: colors.bg, borderRadius: 999, paddingVertical: 15, alignItems: "center" },
  stepper: { backgroundColor: colors.forest, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24, paddingVertical: 12 },
  qty: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
