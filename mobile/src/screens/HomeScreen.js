import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, RefreshControl, FlatList } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import api, { inr } from "../api/client";
import { useStore } from "../context/StoreContext";
import { ProductCard } from "../components/ProductCard";
import { Loading } from "../components/ui";
import { colors } from "../theme";

export default function HomeScreen() {
  const nav = useNavigation();
  const { location, pincode, setPincode, deliveryInfo } = useStore();
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pinInput, setPinInput] = useState("");

  const load = useCallback(async () => {
    if (!location) return;
    try {
      const [c, f] = await Promise.all([
        api.get("/categories"),
        api.get(`/products?location_id=${location.id}${pincode ? `&pincode=${pincode}` : ""}&featured=true`),
      ]);
      setCategories(c.data || []);
      setFeatured(f.data || []);
    } catch { /* noop */ } finally { setLoading(false); setRefreshing(false); }
  }, [location, pincode]);

  useEffect(() => { load(); }, [load]);

  const applyPin = () => { if (/^\d{6}$/.test(pinInput)) setPincode(pinInput); };

  if (loading) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={featured}
      keyExtractor={(i) => i.id}
      numColumns={2}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <View>
          <View style={styles.pinBar}>
            <Ionicons name="location" size={18} color={colors.forest} />
            <TextInput
              style={styles.pinInput}
              placeholder="Enter delivery PIN code"
              keyboardType="number-pad"
              maxLength={6}
              value={pinInput || pincode || ""}
              onChangeText={setPinInput}
              testID="home-pincode-input"
            />
            <TouchableOpacity style={styles.pinBtn} onPress={applyPin} testID="home-pincode-apply"><Text style={styles.pinBtnText}>Check</Text></TouchableOpacity>
          </View>
          {deliveryInfo && (
            <Text style={[styles.pinStatus, { color: deliveryInfo.serviceable ? colors.forest : colors.danger }]}>
              {deliveryInfo.serviceable
                ? `Delivering here · Normal ${inr(deliveryInfo.delivery_charge)}${deliveryInfo.express_enabled ? ` · Get in 30 Minutes ${inr(deliveryInfo.express_charge)}` : ""}`
                : "Sorry, we don't deliver to this PIN yet"}
            </Text>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
            {categories.map((c) => (
              <TouchableOpacity key={c.id} style={styles.cat} onPress={() => nav.navigate("Shop", { category: c.id })}>
                <View style={styles.catIcon}><Ionicons name="pricetag-outline" size={20} color={colors.forest} /></View>
                <Text numberOfLines={1} style={styles.catText}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.section}>Featured</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ flex: 1, maxWidth: "50%" }}>
          <ProductCard product={item} onPress={() => nav.navigate("ProductDetail", { id: item.id, name: item.name })} />
        </View>
      )}
      contentContainerStyle={{ padding: 8, paddingBottom: 32 }}
    />
  );
}

const styles = StyleSheet.create({
  pinBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", margin: 8, borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  pinInput: { flex: 1, paddingVertical: 12, fontSize: 14 },
  pinBtn: { backgroundColor: colors.forest, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  pinBtnText: { color: "#fff", fontWeight: "700" },
  pinStatus: { marginHorizontal: 12, fontSize: 12, fontWeight: "600" },
  cats: { paddingHorizontal: 8, paddingVertical: 12, gap: 14 },
  cat: { alignItems: "center", width: 72 },
  catIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.forestLight, alignItems: "center", justifyContent: "center" },
  catText: { fontSize: 11, marginTop: 6, color: colors.text },
  section: { fontSize: 18, fontWeight: "800", color: colors.text, marginHorizontal: 12, marginTop: 8, marginBottom: 4 },
});
