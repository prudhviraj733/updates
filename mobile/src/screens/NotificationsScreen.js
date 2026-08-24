import { useEffect } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useNotifications } from "../context/NotificationContext";
import { Loading, EmptyState } from "../components/ui";
import { colors } from "../theme";

const ICON = { order: "cube", payment: "card", refund: "refresh", offer: "pricetag", announcement: "megaphone", general: "notifications" };

export default function NotificationsScreen() {
  const nav = useNavigation();
  const { items, loading, loadItems, markRead } = useNotifications();
  useEffect(() => { loadItems(); }, [loadItems]);

  const onTap = (n) => {
    if (!n.read) markRead(n.id);
    if (n.deep_link) nav.navigate("DeepLink", { path: n.deep_link });
  };

  if (loading && items.length === 0) return <Loading />;
  if (items.length === 0) return <EmptyState icon="notifications-outline" title="No notifications yet" />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      data={items}
      keyExtractor={(n) => n.id}
      contentContainerStyle={{ padding: 12 }}
      renderItem={({ item }) => (
        <TouchableOpacity style={[styles.card, !item.read && styles.unread]} onPress={() => onTap(item)} testID={`notif-${item.id}`}>
          <View style={[styles.icon, { backgroundColor: item.read ? colors.bg : colors.forestLight }]}>
            <Ionicons name={`${ICON[item.type] || "notifications"}-outline`} size={18} color={colors.forest} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, !item.read && { fontWeight: "800" }]}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
          {!item.read && <View style={styles.dot} />}
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: 12, backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  unread: { borderColor: colors.forest, backgroundColor: "#F3FAF5" },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  title: { fontWeight: "600", color: colors.text }, body: { color: colors.muted, fontSize: 13, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.saffron },
});
