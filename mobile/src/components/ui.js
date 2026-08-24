import { ActivityIndicator, Text, View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function Loading({ label = "Loading…" }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.forest} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function EmptyState({ icon = "cart-outline", title, subtitle }) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={48} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
    </View>
  );
}

export function ErrorState({ message = "Something went wrong", onRetry }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={44} color={colors.danger} />
      <Text style={styles.emptyTitle}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retry} onPress={onRetry}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, loading, style, testID }) {
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.btn, (disabled || loading) && { opacity: 0.6 }, style]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{title}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  muted: { color: colors.muted, textAlign: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 4 },
  retry: { marginTop: 12, backgroundColor: colors.forest, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 999 },
  retryText: { color: "#fff", fontWeight: "700" },
  btn: { backgroundColor: colors.forest, borderRadius: 999, paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
