import { useEffect, useState } from "react";
import { View, Text, FlatList, Image, StyleSheet } from "react-native";
import api, { inr } from "../api/client";
import { useStore } from "../context/StoreContext";

export default function ProductsScreen({ route }) {
  const { location } = useStore();
  const { categoryId } = route.params || {};
  const [products, setProducts] = useState([]);

  useEffect(() => {
    if (!location) return;
    let url = `/products?location_id=${location.id}`;
    if (categoryId) url += `&category_id=${categoryId}`;
    api.get(url).then(({ data }) => setProducts(data));
  }, [location, categoryId]);

  return (
    <FlatList
      style={styles.c}
      data={products}
      keyExtractor={(p) => p.id}
      numColumns={2}
      columnWrapperStyle={{ justifyContent: "space-between" }}
      renderItem={({ item }) => (
        <View style={styles.card}>
          {item.images?.[0] ? <Image source={{ uri: item.images[0] }} style={styles.img} /> : <View style={[styles.img, { backgroundColor: "#E8F0E5" }]} />}
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.pack}>{item.pack_size}</Text>
          <Text style={styles.price}>{inr(item.selling_price)}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#FAF9F6", padding: 12 },
  card: { width: "48%", backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, overflow: "hidden", padding: 8 },
  img: { width: "100%", height: 120, borderRadius: 10 },
  name: { fontWeight: "600", marginTop: 6 },
  pack: { color: "#6B7280", fontSize: 12 },
  price: { color: "#1B4332", fontWeight: "800", marginTop: 4 },
});
