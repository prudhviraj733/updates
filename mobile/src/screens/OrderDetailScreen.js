import { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import api, { inr } from "../api/client";
import { Loading } from "../components/ui";
import { colors } from "../theme";

export default function OrderDetailScreen() {
  const { id } = useRoute().params;
  const [order, setOrder] = useState(null);

  useEffect(() => { api.get(`/orders/${id}`).then(({ data }) => setOrder(data)).catch(() => {}); }, [id]);
  if (!order) return <Loading />;

  const Row = ({ l, v, bold }) => (
    <View style={styles.row}><Text style={[styles.l, bold && styles.bold]}>{l}</Text><Text style={[styles.v, bold && styles.bold]}>{v}</Text></View>
  );
  const express = order.delivery_type === "express" || order.delivery_type === "asap";
  const expressCharge = order.express_charge ?? order.asap_charge ?? 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.num}>{order.order_number}</Text>
          <View style={[styles.badge, { backgroundColor: express ? "#FEF3C7" : colors.forestLight }]}>
            <Ionicons name={express ? "flash" : "calendar-outline"} size={13} color={express ? colors.saffron : colors.forest} />
            <Text style={[styles.badgeText, { color: express ? "#b45309" : colors.forest }]}>{express ? "30-Min Delivery" : "Scheduled"}</Text>
          </View>
        </View>
        <Text style={styles.status}>Status: {(order.status || "").replace(/_/g, " ")}</Text>
        <Text style={styles.delivery}>{express ? "Get in 30 Minutes" : `Slot: ${order.slot_label || "-"}`}</Text>
      </View>

      <Text style={styles.h}>Items</Text>
      <View style={styles.card}>
        {(order.items || []).map((it, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={{ flex: 1 }} numberOfLines={1}>{it.name} × {it.quantity}</Text>
            <Text style={styles.itemPrice}>{inr((it.price || 0) * it.quantity)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.h}>Payment</Text>
      <View style={styles.card}>
        <Row l="Subtotal" v={inr(order.subtotal)} />
        {order.discount > 0 && <Row l="Discount" v={`- ${inr(order.discount)}`} />}
        {order.coupon_discount > 0 && <Row l="Coupon" v={`- ${inr(order.coupon_discount)}`} />}
        <Row l="Delivery" v={inr(order.delivery_charge)} />
        {expressCharge > 0 && <Row l="30-min delivery charge" v={inr(expressCharge)} />}
        {order.wallet_used > 0 && <Row l="Wallet" v={`- ${inr(order.wallet_used)}`} />}
        {order.gst?.enabled && (order.gst.by_rate || []).map((b) => (
          <Row key={b.rate} l={`GST @ ${b.rate}%${order.gst.pricing === "inclusive" ? " (incl.)" : ""}`} v={`${order.gst.pricing === "inclusive" ? "" : "+ "}${inr(b.tax)}`} />
        ))}
        <Row l="Total" v={inr(order.final_amount)} bold />
        <Row l="Payment" v={`${(order.payment_method || "").toUpperCase()} · ${order.payment_status || ""}`} />
      </View>

      <Text style={styles.h}>Delivering to</Text>
      <View style={styles.card}>
        <Text style={styles.addr}>{order.address?.full_name}</Text>
        <Text style={styles.addrSub}>{order.address?.line1}, {order.address?.area}, {order.address?.city} - {order.address?.pincode}</Text>
        <Text style={styles.addrSub}>{order.customer_phone}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  num: { fontWeight: "800", fontSize: 16, color: colors.text },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontWeight: "800", fontSize: 11 },
  status: { marginTop: 8, color: colors.text, textTransform: "capitalize" },
  delivery: { color: colors.muted, marginTop: 2 },
  h: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 12, marginBottom: 6 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  itemPrice: { fontWeight: "600", color: colors.text },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  l: { color: colors.muted }, v: { color: colors.text },
  bold: { fontWeight: "800", color: colors.text },
  addr: { fontWeight: "700", color: colors.text }, addrSub: { color: colors.muted, marginTop: 2 },
});
