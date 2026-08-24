import { useState } from "react";
import { View, ActivityIndicator, Alert } from "react-native";
import { WebView } from "react-native-webview";
import { useRoute, useNavigation } from "@react-navigation/native";
import api from "../api/client";
import { useStore } from "../context/StoreContext";
import { colors } from "../theme";

/**
 * Razorpay Checkout inside a WebView (no native module needed; works in EAS builds).
 * On success we call /payments/razorpay/verify with the app's Bearer token, then
 * navigate to the order. This reuses the SAME backend order + verify endpoints as web.
 */
export default function RazorpayScreen() {
  const { order, rzp, contact, email } = useRoute().params;
  const nav = useNavigation();
  const { clearCart } = useStore();
  const [busy, setBusy] = useState(false);

  const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="background:#1B4332;margin:0;height:100vh;display:flex;align-items:center;justify-content:center">
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
  var options = {
    key: ${JSON.stringify(rzp.key_id)},
    amount: ${JSON.stringify(rzp.amount)},
    currency: ${JSON.stringify(rzp.currency)},
    order_id: ${JSON.stringify(rzp.razorpay_order_id)},
    name: "BestKart",
    description: ${JSON.stringify(order.order_number)},
    prefill: { contact: ${JSON.stringify(contact || "")}, email: ${JSON.stringify(email || "")} },
    theme: { color: "#1B4332" },
    handler: function (resp) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "success", resp: resp })); },
    modal: { ondismiss: function () { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" })); } }
  };
  var rz = new Razorpay(options);
  rz.on('payment.failed', function (r) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "failed" })); });
  rz.open();
</script></body></html>`;

  const onMessage = async (e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === "success") {
      setBusy(true);
      try {
        await api.post("/payments/razorpay/verify", msg.resp);
        await clearCart();
        Alert.alert("Payment successful", `Order ${order.order_number} confirmed.`);
      } catch {
        Alert.alert("Payment verification failed", "Your order is saved — you can retry payment from My Orders.");
      } finally {
        nav.replace("OrderDetail", { id: order.id });
      }
    } else if (msg.type === "dismiss") {
      Alert.alert("Payment cancelled", "Your order is saved. You can retry payment from My Orders.");
      nav.replace("OrderDetail", { id: order.id });
    } else if (msg.type === "failed") {
      Alert.alert("Payment failed", "Please try again or choose another method.");
      nav.replace("OrderDetail", { id: order.id });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.forest }}>
      <WebView originWhitelist={["*"]} source={{ html }} onMessage={onMessage} javaScriptEnabled />
      {busy && <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#fff" size="large" /></View>}
    </View>
  );
}
