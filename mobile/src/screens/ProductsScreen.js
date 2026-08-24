import { useEffect, useState, useCallback } from "react";
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import api from "../api/client";
import { useStore } from "../context/StoreContext";
import { ProductCard } from "../components/ProductCard";
import { Loading, EmptyState } from "../components/ui";
import { colors } from "../theme";

export default function ProductsScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { location, pincode } = useStore();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(route.params?.category || "");

  useEffect(() => { api.get("/categories").then(({ data }) => setCategories(data || [])); }, []);
  useEffect(() => { if (route.params?.category !== undefined) setCategory(route.params.category); }, [route.params]);

  const load = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    let url = `/products?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`;
    if (category) url += `&category_id=${category}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    try { const { data } = await api.get(url); setProducts(data || []); } catch { /* noop */ } finally { setLoading(false); }
  }, [location, pincode, category, search]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search products" value={search} onChangeText={setSearch} testID="search-input" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 46 }} contentContainerStyle={styles.chips}>
        <Chip label="All" active={!category} onPress={() => setCategory("")} />
        {categories.map((c) => <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => setCategory(c.id)} />)}
      </ScrollView>

      {loading ? <Loading /> : products.length === 0 ? (
        <EmptyState icon="search-outline" title="No products found" subtitle="Try another search or category" />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(i) => i.id}
          numColumns={2}
          renderItem={({ item }) => (
            <View style={{ flex: 1, maxWidth: "50%" }}>
              <ProductCard product={item} onPress={() => nav.navigate("ProductDetail", { id: item.id, name: item.name })} />
            </View>
          )}
          contentContainerStyle={{ padding: 8, paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.forest, borderColor: colors.forest }]}>
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", margin: 8, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 12 },
  chips: { paddingHorizontal: 8, gap: 8, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "#fff", height: 34 },
  chipText: { color: colors.text, fontWeight: "600", fontSize: 13 },
});
