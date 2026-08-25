import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { View, Text } from "react-native";

import { useAuth } from "../context/AuthContext";
import { useStore } from "../context/StoreContext";
import { useNotifications } from "../context/NotificationContext";
import { Loading } from "../components/ui";
import { colors } from "../theme";

import AuthScreen from "../screens/AuthScreen";
import HomeScreen from "../screens/HomeScreen";
import ProductsScreen from "../screens/ProductsScreen";
import ProductDetailScreen from "../screens/ProductDetailScreen";
import CartScreen from "../screens/CartScreen";
import CheckoutScreen from "../screens/CheckoutScreen";
import RazorpayScreen from "../screens/RazorpayScreen";
import OrdersScreen from "../screens/OrdersScreen";
import OrderDetailScreen from "../screens/OrderDetailScreen";
import AccountScreen from "../screens/AccountScreen";
import AddressFormScreen from "../screens/AddressFormScreen";
import OffersScreen from "../screens/OffersScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import DeepLinkScreen from "../screens/DeepLinkScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabBadge({ count }) {
  if (!count) return null;
  return (
    <View style={{ position: "absolute", top: -4, right: -10, backgroundColor: colors.saffron, borderRadius: 999, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }}>
      <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

function Tabs() {
  const { cartCount } = useStore();
  const { unread } = useNotifications();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.forest },
        headerTintColor: "#fff",
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, size }) => {
          const map = { Home: "home", Shop: "grid", Cart: "cart", Orders: "receipt", Account: "person" };
          return (
            <View>
              <Ionicons name={`${map[route.name]}-outline`} size={size} color={color} />
              {route.name === "Cart" && <TabBadge count={cartCount} />}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "SavingSmart" }} />
      <Tab.Screen name="Shop" component={ProductsScreen} />
      <Tab.Screen name="Cart" component={CartScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: "My Orders" }} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { user, booting } = useAuth();
  if (booting) return <Loading label="Starting SavingSmart…" />;

  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.forest }, headerTintColor: "#fff" }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      ) : (
        <>
          <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: "Product" }} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: "Checkout" }} />
          <Stack.Screen name="Razorpay" component={RazorpayScreen} options={{ title: "Payment" }} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: "Order" }} />
          <Stack.Screen name="AddressForm" component={AddressFormScreen} options={{ title: "Add Address" }} />
          <Stack.Screen name="Offers" component={OffersScreen} options={{ title: "Offers" }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
          <Stack.Screen name="DeepLink" component={DeepLinkScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}
