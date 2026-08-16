import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "./src/context/AuthContext";
import { StoreProvider } from "./src/context/StoreContext";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import ProductsScreen from "./src/screens/ProductsScreen";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: "#1B4332" }, headerTintColor: "#fff" }}>
            <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Freshly" }} />
            <Stack.Screen name="Products" component={ProductsScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </StoreProvider>
    </AuthProvider>
  );
}
