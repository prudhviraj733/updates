import { useEffect, useState, useCallback, useMemo } from "react";
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
  const [subs, setSubs] = useState([]);
  const [subsubs, setSubsubs] = useState([]);
  const [products, setProducts] = useState([]);
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(route.params?.category || "");
  const [subcategory, setSubcategory] = useState("");
  const [subsubcategory, setSubsubcategory] = useState("");

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCategories(data || []));
    api.get("/subcategories").then(({ data }) => setSubs(data || []));
    api.get("/subsubcategories").then(({ data }) => setSubsubs(data || []));
  }, []);
  useEffect(() => {
    if (route.params?.category !== undefined) { setCategory(route.params.category); setSubcategory(""); setSubsubcategory(""); }
  }, [route.params]);

  const subsForCat = useMemo(() => subs.filter((s) => s.parent_id === category), [subs, category]);
  const subsubsForSub = useMemo(() => subsubs.filter((ss) => ss.parent_id === subcategory), [subsubs, subcategory]);
  const showSubsubChooser = !!subcategory && subsubsForSub.length > 0 && !subsubcategory;

  const activeCat = categories.find((c) => c.id === category);
  const activeSub = subs.find((s) => s.id === subcategory);
  const activeSubsub = subsubs.find((ss) => ss.id === subsubcategory);

  const load = useCallback(async () => {
    if (!location) return;
    setLoading(true);
    try {
      if (search.trim()) {
        const { data } = await api.get(`/products/search-resolve?q=${encodeURIComponent(search)}&location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`);
        setSearchResult(data);
        setProducts(data.status === "available" ? (data.products || []) : (data.alternatives || []));
      } else {
        setSearchResult(null);
        if (showSubsubChooser) { setProducts([]); return; }
        let url = `/products?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}`;
        if (category) url += `&category_id=${category}`;
        if (subcategory) url += `&subcategory_id=${subcategory}`;
        if (subsubcategory && subsubcategory !== "all") url += `&subsubcategory_id=${subsubcategory}`;
        const { data } = await api.get(url);
        setProducts(data || []);
      }
    } catch { /* noop */ } finally { setLoading(false); }
  }, [location, pincode, category, subcategory, subsubcategory, search, showSubsubChooser]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  const searching = !!search.trim();

  const Header = (
    <View>
      {/* Breadcrumb */}
      {!searching && (activeCat || activeSub) && (
        <View style={styles.crumbs} testID="breadcrumb">
          <TouchableOpacity onPress={() => { setCategory(""); setSubcategory(""); setSubsubcategory(""); }}><Text style={styles.crumbLink}>Home</Text></TouchableOpacity>
          {activeCat && <><Ionicons name="chevron-forward" size={13} color={colors.muted} /><TouchableOpacity onPress={() => { setSubcategory(""); setSubsubcategory(""); }}><Text style={subcategory ? styles.crumbLink : styles.crumbNow}>{activeCat.name}</Text></TouchableOpacity></>}
          {activeSub && <><Ionicons name="chevron-forward" size={13} color={colors.muted} /><TouchableOpacity onPress={() => setSubsubcategory("")}><Text style={subsubcategory ? styles.crumbLink : styles.crumbNow}>{activeSub.name}</Text></TouchableOpacity></>}
          {activeSubsub && <><Ionicons name="chevron-forward" size={13} color={colors.muted} /><Text style={styles.crumbNow}>{activeSubsub.name}</Text></>}
        </View>
      )}

      {/* Category chips */}
      {!searching && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 46 }} contentContainerStyle={styles.chips}>
          <Chip label="All" active={!category} onPress={() => { setCategory(""); setSubcategory(""); setSubsubcategory(""); }} />
          {categories.map((c) => <Chip key={c.id} label={c.name} active={category === c.id} onPress={() => { setCategory(c.id); setSubcategory(""); setSubsubcategory(""); }} />)}
        </ScrollView>
      )}

      {/* Subcategory chips */}
      {!searching && category && subsForCat.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 46 }} contentContainerStyle={styles.chips}>
          <Chip label="All" active={!subcategory} onPress={() => { setSubcategory(""); setSubsubcategory(""); }} small />
          {subsForCat.map((s) => <Chip key={s.id} label={s.name} active={subcategory === s.id} onPress={() => { setSubcategory(s.id); setSubsubcategory(""); }} small />)}
        </ScrollView>
      )}

      {/* Sub-subcategory chips */}
      {!searching && subcategory && subsubsForSub.length > 0 && (
        <>
          <Text style={styles.chooseLabel}>Choose a type in {activeSub?.name}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 46 }} contentContainerStyle={styles.chips}>
            <Chip label={`All ${activeSub?.name || ""}`} active={subsubcategory === "all"} onPress={() => setSubsubcategory(subsubcategory === "all" ? "" : "all")} small />
            {subsubsForSub.map((ss) => <Chip key={ss.id} label={ss.name} active={subsubcategory === ss.id} onPress={() => setSubsubcategory(subsubcategory === ss.id ? "" : ss.id)} small />)}
          </ScrollView>
        </>
      )}

      {/* Search unavailable banner */}
      {searching && searchResult && searchResult.status !== "available" && (
        <View style={styles.banner} testID="search-banner">
          <Ionicons name="alert-circle-outline" size={20} color={colors.saffron} />
          <Text style={styles.bannerText}>{searchResult.message}</Text>
        </View>
      )}
      {searching && searchResult && searchResult.status === "out_of_stock" && (searchResult.alternatives || []).length > 0 && (
        <Text style={styles.section}>Available alternatives</Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput style={styles.searchInput} placeholder="Search products" value={search} onChangeText={setSearch} testID="search-input" />
        {searching ? <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={colors.muted} /></TouchableOpacity> : null}
      </View>

      {loading ? <Loading /> : showSubsubChooser ? (
        <FlatList data={[]} ListHeaderComponent={Header} renderItem={null}
          ListFooterComponent={<EmptyState icon="grid-outline" title="Pick a type" subtitle={`Select an option above to browse ${activeSub?.name}`} />}
          contentContainerStyle={{ padding: 8 }} />
      ) : products.length === 0 ? (
        <FlatList data={[]} ListHeaderComponent={Header} renderItem={null}
          ListFooterComponent={<EmptyState icon="search-outline" title="No products found" subtitle="Try another search or category" />}
          contentContainerStyle={{ padding: 8 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(i) => i.id}
          numColumns={2}
          ListHeaderComponent={Header}
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

function Chip({ label, active, onPress, small }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, small && styles.chipSmall, active && { backgroundColor: colors.forest, borderColor: colors.forest }]}>
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", margin: 8, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 12 },
  chips: { paddingHorizontal: 8, gap: 8, alignItems: "center" },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: "#fff", height: 34 },
  chipSmall: { paddingHorizontal: 12, paddingVertical: 6, height: 32 },
  chipText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  crumbs: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 6 },
  crumbLink: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  crumbNow: { color: colors.text, fontSize: 12, fontWeight: "800" },
  chooseLabel: { fontSize: 12, fontWeight: "700", color: colors.muted, marginHorizontal: 12, marginTop: 8 },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF7E6", borderRadius: 12, padding: 12, marginHorizontal: 8, marginBottom: 4, borderWidth: 1, borderColor: "#F5D89A" },
  bannerText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
  section: { fontSize: 16, fontWeight: "800", color: colors.text, marginHorizontal: 12, marginTop: 10, marginBottom: 2 },
});
