import { useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Switch, Alert } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import api, { apiError } from "../api/client";
import { useStore } from "../context/StoreContext";
import { PrimaryButton } from "../components/ui";
import { colors } from "../theme";

const EMPTY = { label: "", full_name: "", phone: "", line1: "", area: "", city: "", pincode: "", is_default: false };

export default function AddressFormScreen() {
  const nav = useNavigation();
  const { onSaved } = useRoute().params || {};
  const { location, locations } = useStore();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
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

  const Field = ({ k, placeholder, keyboardType, maxLength }) => (
    <TextInput style={styles.input} placeholder={placeholder} keyboardType={keyboardType} maxLength={maxLength}
      value={form[k]} onChangeText={(v) => set(k, v)} testID={`addr-${k}`} />
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Field k="label" placeholder="Label (Home, Work)" />
      <Field k="full_name" placeholder="Full name" />
      <Field k="phone" placeholder="Phone" keyboardType="phone-pad" maxLength={10} />
      <Field k="line1" placeholder="House / Flat / Street" />
      <Field k="area" placeholder="Area / Locality" />
      <Field k="city" placeholder="City" />
      <Field k="pincode" placeholder="PIN code" keyboardType="number-pad" maxLength={6} />
      <View style={styles.switchRow}>
        <Text style={{ color: colors.text, fontWeight: "600" }}>Set as default</Text>
        <Switch value={form.is_default} onValueChange={(v) => set("is_default", v)} trackColor={{ true: colors.forest }} />
      </View>
      <PrimaryButton title="Save address" loading={saving} onPress={save} testID="addr-save" style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff", marginBottom: 10 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
});
