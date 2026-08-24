import { useEffect, useState, useCallback } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import api, { inr, apiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "../components/ui";
import { colors } from "../theme";

export default function AccountScreen() {
  const nav = useNavigation();
  const { user, logout, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [addresses, setAddresses] = useState([]);
  const [wallet, setWallet] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, w] = await Promise.all([api.get("/addresses"), api.get("/me/wallet").catch(() => ({ data: null }))]);
      setAddresses(a.data || []);
      setWallet(w.data);
    } catch { /* noop */ }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const saveName = async () => {
    try { await updateProfile({ name }); Alert.alert("Saved", "Profile updated"); }
    catch (e) { Alert.alert("Error", apiError(e)); }
  };
  const delAddr = async (id) => {
    try { await api.delete(`/addresses/${id}`); setAddresses((a) => a.filter((x) => x.id !== id)); } catch { /* noop */ }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} testID="account-name" />
        <Text style={styles.label}>Email</Text>
        <Text style={styles.readonly}>{user?.email}</Text>
        <Text style={styles.label}>Mobile</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.readonly}>{user?.phone || "—"}</Text>
          {user?.phone_verified ? <Ionicons name="checkmark-circle" size={16} color={colors.forest} /> : null}
        </View>
        <PrimaryButton title="Save profile" onPress={saveName} style={{ marginTop: 12 }} testID="account-save" />
      </View>

      {wallet ? (
        <View style={styles.walletCard}>
          <Text style={{ color: "#fff", opacity: 0.9 }}>Wallet balance</Text>
          <Text style={styles.walletBal}>{inr(wallet.balance)}</Text>
        </View>
      ) : null}

      <View style={styles.rowBetween}>
        <Text style={styles.h}>Addresses</Text>
        <TouchableOpacity onPress={() => nav.navigate("AddressForm", { onSaved: load })}><Text style={styles.link}>+ Add</Text></TouchableOpacity>
      </View>
      {addresses.map((a) => (
        <View key={a.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.addrTitle}>{a.label || a.full_name}{a.is_default ? "  ·  Default" : ""}</Text>
            <TouchableOpacity onPress={() => delAddr(a.id)}><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>
          </View>
          <Text style={styles.addrSub}>{a.line1}, {a.area}, {a.city} - {a.pincode}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.linkRow} onPress={() => nav.navigate("Offers")}><Ionicons name="pricetags-outline" size={20} color={colors.forest} /><Text style={styles.linkText}>Offers & Coupons</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></TouchableOpacity>
      <TouchableOpacity style={styles.linkRow} onPress={() => nav.navigate("Notifications")}><Ionicons name="notifications-outline" size={20} color={colors.forest} /><Text style={styles.linkText}>Notifications</Text><Ionicons name="chevron-forward" size={18} color={colors.muted} /></TouchableOpacity>

      <TouchableOpacity style={styles.logout} onPress={logout} testID="account-logout"><Ionicons name="log-out-outline" size={20} color={colors.danger} /><Text style={{ color: colors.danger, fontWeight: "700" }}>Logout</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  label: { color: colors.muted, fontSize: 12, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  readonly: { color: colors.text, fontWeight: "600", marginTop: 4 },
  walletCard: { backgroundColor: colors.forest, borderRadius: 14, padding: 16, marginBottom: 10 },
  walletBal: { color: "#fff", fontSize: 26, fontWeight: "900", marginTop: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h: { fontSize: 16, fontWeight: "800", color: colors.text, marginVertical: 6 },
  link: { color: colors.forest, fontWeight: "700" },
  addrTitle: { fontWeight: "700", color: colors.text }, addrSub: { color: colors.muted, marginTop: 2 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 4, marginBottom: 6 },
  linkText: { flex: 1, fontWeight: "600", color: colors.text },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, marginTop: 8 },
});
