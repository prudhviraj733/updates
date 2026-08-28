import { useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Switch, Alert, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import api, { apiError } from "../api/client";
import { useStore } from "../context/StoreContext";
import { PrimaryButton } from "../components/ui";
import { MapPickerWebView } from "../components/MapPickerWebView";
import { colors } from "../theme";

const EMPTY = { label: "", full_name: "", phone: "", line1: "", area: "", city: "", pincode: "", latitude: null, longitude: null, is_default: false };

export default function AddressFormScreen() {
  const nav = useNavigation();
  const { onSaved } = useRoute().params || {};
  const { location, locations } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const mapRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.full_name || !form.line1 || !/^\d{6}$/.test(form.pincode)) {
      return Alert.alert("Missing details", "Please fill name, address line and a valid 6-digit PIN code");
    }
    setSaving(true);
    try {
      await api.post("/addresses", { ...form, location_id: location?.id || locations[0]?.id });
      onSaved && onSaved();
      nav.goBack();
    } catch (e) { Alert.alert("Error", apiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.h}>Delivery location</Text>
      <Text style={styles.hint}>Tap "Use my current location", or drag the pin to set the exact drop point. You can also enter the address manually below.</Text>

      <TouchableOpacity style={styles.locBtn} onPress={() => mapRef.current && mapRef.current.locate()} testID="use-current-location">
        <Ionicons name="locate" size={18} color="#fff" />
        <Text style={styles.locBtnText}>Use my current location</Text>
      </TouchableOpacity>

      <MapPickerWebView
        ref={mapRef}
        lat={form.latitude}
        lng={form.longitude}
        onChange={(la, lo) => setForm((f) => ({ ...f, latitude: la, longitude: lo }))}
        onGeo={(g) => setForm((f) => ({
          ...f,
          latitude: g.lat, longitude: g.lng,
          pincode: /^\d{6}$/.test(g.pincode || "") ? g.pincode : f.pincode,
          city: f.city || g.city || "",
          area: f.area || g.area || "",
        }))}
        onDenied={() => Alert.alert("Location off", "We couldn't access your location. Drag the pin on the map or type your address manually.")}
        style={{ marginBottom: 8 }}
      />
      {typeof form.latitude === "number" && (
        <Text style={styles.coords} testID="addr-coords">Pinned: {form.latitude.toFixed(5)}, {form.longitude.toFixed(5)}</Text>
      )}

      <Text style={styles.h}>Address details</Text>
      <TextInput style={styles.input} placeholder="Label (Home, Work)" value={form.label} onChangeText={(v) => set("label", v)} testID="addr-label" />
      <TextInput style={styles.input} placeholder="Full name" value={form.full_name} onChangeText={(v) => set("full_name", v)} testID="addr-full_name" />
      <TextInput style={styles.input} placeholder="Phone" keyboardType="phone-pad" maxLength={10} value={form.phone} onChangeText={(v) => set("phone", v)} testID="addr-phone" />
      <TextInput style={styles.input} placeholder="House / Flat / Street" value={form.line1} onChangeText={(v) => set("line1", v)} testID="addr-line1" />
      <TextInput style={styles.input} placeholder="Area / Locality" value={form.area} onChangeText={(v) => set("area", v)} testID="addr-area" />
      <TextInput style={styles.input} placeholder="City" value={form.city} onChangeText={(v) => set("city", v)} testID="addr-city" />
      <TextInput style={styles.input} placeholder="PIN code" keyboardType="number-pad" maxLength={6} value={form.pincode} onChangeText={(v) => set("pincode", v)} testID="addr-pincode" />
      <View style={styles.switchRow}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>Set as default</Text>
        <Switch value={form.is_default} onValueChange={(v) => set("is_default", v)} trackColor={{ true: colors.forest }} />
      </View>
      <PrimaryButton title="Save address" loading={saving} onPress={save} testID="addr-save" style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 12, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, marginBottom: 10 },
  locBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.forest, borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
  locBtnText: { color: "#fff", fontWeight: "700" },
  coords: { fontSize: 12, color: colors.forest, fontWeight: "600", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff", marginBottom: 10 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
});
