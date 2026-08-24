import { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import api, { inr } from "../api/client";
import { Loading, EmptyState } from "../components/ui";
import { colors } from "../theme";

const STATUS_COLOR = { delivered: "#16a34a", cancelled: "#dc2626", pending: "#d97706" };

export default function OrdersScreen() {
  const nav = useNavigation();
  const [orders, setOrders] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/orders"); setOrders(data || []); }
    catch { setOrders([]); } finally { setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (orders === null) return <Loading />;
  if (orders.length === 0) return <EmptyState icon="receipt-outline" title="No orders yet" subtitle="Your orders will appear here" />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={orders}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => nav.navigate("OrderDetail", { id: item.id })} testID={`order-${item.id}`}>
          <View style={styles.rowBetween}>
            <Text style={styles.num}>{item.order_number}</Text>
            <Text style={[styles.status, { color: STATUS_COLOR[item.status] || colors.forest }]}>{(item.status || "").replace(/_/g, " ")}</Text>
          </View>
          <View style={styles.rowBetween}>
            <View style={styles.tag}>
              <Ionicons name={item.is_priority ? "flash" : "time-outline"} size={13} color={item.is_priority ? colors.saffron : colors.muted} />
              <Text style={styles.tagText}>{item.is_priority ? "30-Min" : (item.slot_label || "Scheduled")}</Text>
            </View>
            <Text style={styles.total}>{inr(item.final_amount)}</Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  num: { fontWeight: "800", color: colors.text },
  status: { fontWeight: "700", textTransform: "capitalize", fontSize: 12 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4 },
  tagText: { color: colors.muted, fontSize: 12 },
  total: { fontWeight: "800", color: colors.forest },
});
