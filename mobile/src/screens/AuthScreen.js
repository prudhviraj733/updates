import { useState } from "react";
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Alert } from "react-native";
import { useAuth } from "../context/AuthContext";
import { PrimaryButton } from "../components/ui";
import { apiError } from "../api/client";
import { colors } from "../theme";

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email.trim(), form.password);
      } else {
        if (form.password.length < 6) throw { response: { data: { detail: "Password must be at least 6 characters" } } };
        await register({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password });
      }
    } catch (e) {
      Alert.alert(mode === "login" ? "Login failed" : "Registration failed", apiError(e, "Please check your details and try again"));
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.forest }}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>SavingSmart</Text>
        <Text style={styles.tagline}>Fresh groceries, delivered your way</Text>

        <View style={styles.card}>
          <View style={styles.toggle}>
            {["login", "register"].map((m) => (
              <TouchableOpacity key={m} style={[styles.toggleBtn, mode === m && styles.toggleActive]} onPress={() => setMode(m)} testID={`auth-tab-${m}`}>
                <Text style={[styles.toggleText, mode === m && { color: "#fff" }]}>{m === "login" ? "Login" : "Register"}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {mode === "register" && (
            <TextInput style={styles.input} placeholder="Full name" value={form.name} onChangeText={(v) => set("name", v)} testID="auth-name" />
          )}
          <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => set("email", v)} testID="auth-email" />
          {mode === "register" && (
            <TextInput style={styles.input} placeholder="Mobile (10 digits)" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => set("phone", v)} testID="auth-phone" />
          )}
          <TextInput style={styles.input} placeholder="Password" secureTextEntry value={form.password} onChangeText={(v) => set("password", v)} testID="auth-password" />

          <PrimaryButton title={mode === "login" ? "Login" : "Create account"} onPress={submit} loading={loading} testID="auth-submit" style={{ marginTop: 8 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logo: { fontSize: 40, fontWeight: "900", color: "#fff", textAlign: "center" },
  tagline: { color: colors.forestLight, textAlign: "center", marginTop: 4, marginBottom: 24 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 20, gap: 12 },
  toggle: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: 999, padding: 4, marginBottom: 4 },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 999 },
  toggleActive: { backgroundColor: colors.forest },
  toggleText: { fontWeight: "700", color: colors.muted },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
});
