import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const submit = async () => {
    try {
      await login(email, password);
      navigation.navigate("Home");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Login failed");
    }
  };

  return (
    <View style={styles.c}>
      <Text style={styles.h}>Sign in to Freshly</Text>
      <TextInput style={styles.i} placeholder="Email" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <TextInput style={styles.i} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
      {err ? <Text style={styles.e}>{err}</Text> : null}
      <TouchableOpacity style={styles.b} onPress={submit}><Text style={styles.bt}>Sign in</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, padding: 24, justifyContent: "center", backgroundColor: "#FAF9F6" },
  h: { fontSize: 26, fontWeight: "800", color: "#1B4332", marginBottom: 20 },
  i: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, marginBottom: 12 },
  e: { color: "#DC2626", marginBottom: 8 },
  b: { backgroundColor: "#1B4332", padding: 16, borderRadius: 999, alignItems: "center" },
  bt: { color: "#fff", fontWeight: "700" },
});
