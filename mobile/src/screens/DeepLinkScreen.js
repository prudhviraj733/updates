import { useEffect } from "react";
import { View } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Loading } from "../components/ui";

/** Resolves a notification deep-link path to the right screen. */
export default function DeepLinkScreen() {
  const { path } = useRoute().params || {};
  const nav = useNavigation();

  useEffect(() => {
    const p = String(path || "/");
    const parts = p.split("?")[0].split("/").filter(Boolean); // e.g. ["orders","<id>"]
    try {
      if (parts[0] === "orders" && parts[1]) nav.replace("OrderDetail", { id: parts[1] });
      else if (parts[0] === "product" && parts[1]) nav.replace("ProductDetail", { id: parts[1] });
      else if (parts[0] === "offers") nav.replace("Offers");
      else if (parts[0] === "orders") nav.replace("Tabs", { screen: "Orders" });
      else if (parts[0] === "notifications") nav.replace("Notifications");
      else nav.replace("Tabs", { screen: "Home" });
    } catch {
      nav.replace("Tabs", { screen: "Home" });
    }
  }, [path]);

  return <View style={{ flex: 1 }}><Loading label="Opening…" /></View>;
}
