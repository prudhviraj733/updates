import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from "react-native";
import api from "../api/client";
import { useStore } from "../context/StoreContext";

export default function HomeScreen({ navigation }) {
  const { location } = useStore();
  const [categories, setCategories] = useState([]);

  useEffect(() => { api.get("/categories").then(({ data }) => setCategories(data)); }, []);

  return (
    <ScrollView style={styles.c}>
      <Text style={styles.loc}>Deliver to: {location?.area || "Select area"}</Text>
      <Text style={styles.h}>Fresh groceries, delivered your way</Text>
      <Text style={styles.sub}>Shop by category</Text>
      <View style={styles.grid}>
        {categories.map((cat) => (
          <TouchableOpacity key={cat.id} style={styles.card} onPress={() => navigation.navigate("Products", { categoryId: cat.id, name: cat.name })}>
            {cat.image_url ? <Image source={{ uri: cat.image_url }} style={styles.img} /> : <View style={[styles.img, { backgroundColor: "#E8F0E5" }]} />}
            <Text style={styles.cname}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#FAF9F6", padding: 16 },
  loc: { color: "#4B5563", fontSize: 12 },
  h: { fontSize: 24, fontWeight: "800", color: "#111827", marginVertical: 10 },
  sub: { fontSize: 16, fontWeight: "700", marginTop: 8, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: { width: "48%", backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  img: { width: "100%", height: 110 },
  cname: { padding: 10, fontWeight: "600" },
});
