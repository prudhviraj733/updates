import { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import api, { inr } from "../api/client";
import { useStore } from "../context/StoreContext";
import { Loading, EmptyState } from "../components/ui";
import { colors } from "../theme";

export default function OffersScreen() {
  const { location } = useStore();
  const [coupons, setCoupons] = useState(null);

  useEffect(() => {
    if (!location) return;
    api.get(`/coupons/available?location_id=${location.id}`).then(({ data }) => setCoupons(data || [])).catch(() => setCoupons([]));
  }, [location]);

  if (coupons === null) return <Loading />;
  if (coupons.length === 0) return <EmptyState icon="pricetags-outline" title="No active offers" subtitle="Check back soon for new deals" />;

  const label = (c) => c.discount_type === "percentage" ? `${c.discount_value}% OFF${c.max_discount ? ` up to ${inr(c.max_discount)}` : ""}` : `${inr(c.discount_value)} OFF`;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={coupons}
      keyExtractor={(c) => c.code}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => (
        <View style={styles.card} testID={`offer-${item.code}`}>
          <View style={styles.rowBetween}>
            <Text style={styles.discount}>{label(item)}</Text>
            <Ionicons name="pricetag" size={20} color={colors.saffron} />
          </View>
          <Text style={styles.sub}>{item.min_order_value > 0 ? `On orders above ${inr(item.min_order_value)}` : "On all orders"}</Text>
          <View style={styles.codeBox}><Text style={styles.code}>{item.code}</Text></View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.saffron },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  discount: { fontSize: 18, fontWeight: "900", color: colors.saffron },
  sub: { color: colors.muted, marginTop: 6 },
  codeBox: { marginTop: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.forest, borderRadius: 10, paddingVertical: 8, alignItems: "center", backgroundColor: colors.forestLight },
  code: { fontWeight: "900", letterSpacing: 2, color: colors.forest, fontSize: 16 },
});
