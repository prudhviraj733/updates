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
  const { user, logout, updateProfile, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState((user?.phone || "").replace(/^\+91/, ""));
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
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

  useEffect(() => { setPhone((user?.phone || "").replace(/^\+91/, "")); }, [user]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = /^[6-9]\d{9}$/.test(digits);
  const verified = !!user?.phone_verified;

  const sendOtp = async () => {
    if (!phoneValid) { Alert.alert("Invalid number", "Enter a valid 10-digit Indian mobile number"); return; }
    setSending(true);
    try {
      const { data } = await api.post("/auth/phone/send-otp", { phone: digits });
      if (data.status === "already_verified") { Alert.alert("Verified", data.message); setOtpStep(false); return; }
      setOtpStep(true); setOtp(""); setCooldown(30);
      Alert.alert("OTP sent", data.dev_otp ? `Dev OTP: ${data.dev_otp}` : (data.message || "Check your SMS for the 6-digit code."));
    } catch (e) { Alert.alert("Could not send OTP", apiError(e)); }
    finally { setSending(false); }
  };

  const verifyOtp = async () => {
    setVerifying(true);
    try {
      await api.post("/auth/phone/verify-otp", { phone: digits, otp });
      await refreshUser();
      setOtpStep(false); setOtp("");
      Alert.alert("Success", "Mobile number verified \u2713");
    } catch (e) { Alert.alert("Verification failed", apiError(e)); }
    finally { setVerifying(false); }
  };

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
        <Text style={styles.label}>Mobile number</Text>
        {verified ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }} testID="phone-verified">
            <Text style={styles.readonly}>{user?.phone}</Text>
            <Ionicons name="checkmark-circle" size={16} color={colors.forest} />
            <Text style={{ color: colors.forest, fontWeight: "700", fontSize: 12 }}>Mobile Number Verified ✓</Text>
          </View>
        ) : (
          <View>
            {user?.phone ? <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Current: {user.phone} (not verified)</Text> : null}
            <View style={styles.phoneRow}>
              <View style={styles.cc}><Text style={{ color: colors.muted }}>+91</Text></View>
              <TextInput style={[styles.input, { flex: 1, marginTop: 0 }]} placeholder="10-digit mobile" keyboardType="phone-pad" maxLength={10} value={digits} onChangeText={(v) => { setPhone(v.replace(/\D/g, "").slice(0, 10)); setOtpStep(false); }} testID="verify-phone-input" />
            </View>
            {digits.length > 0 && !phoneValid ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 4 }}>Enter a valid number starting 6-9.</Text> : null}
            {!otpStep ? (
              <PrimaryButton title={sending ? "Sending…" : "Verify Mobile Number"} onPress={sendOtp} disabled={!phoneValid || sending} style={{ marginTop: 10 }} testID="verify-phone-btn" />
            ) : (
              <View style={styles.otpBox} testID="otp-section">
                <Text style={styles.label}>Enter OTP sent to +91 {digits}</Text>
                <TextInput style={[styles.input, { letterSpacing: 8 }]} placeholder="000000" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))} testID="otp-input" />
                <PrimaryButton title={verifying ? "Verifying…" : "Confirm OTP"} onPress={verifyOtp} disabled={otp.length !== 6 || verifying} style={{ marginTop: 8 }} testID="submit-otp-btn" />
                <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
                  <TouchableOpacity disabled={cooldown > 0 || sending} onPress={sendOtp} testID="resend-otp-btn"><Text style={{ color: cooldown > 0 ? colors.muted : colors.forest, fontWeight: "700" }}>{cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => setOtpStep(false)} testID="cancel-otp-btn"><Text style={{ color: colors.muted }}>Cancel</Text></TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
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
  phoneRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  cc: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, justifyContent: "center", height: 42 },
  otpBox: { backgroundColor: colors.bg, borderRadius: 12, padding: 12, marginTop: 10 },
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
