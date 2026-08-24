import { useRef } from "react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./src/context/AuthContext";
import { StoreProvider } from "./src/context/StoreContext";
import { NotificationProvider } from "./src/context/NotificationContext";
import RootNavigator from "./src/navigation/RootNavigator";

export const navigationRef = createNavigationContainerRef();

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StoreProvider>
          <NotificationProvider navigationRef={navigationRef}>
            <NavigationContainer ref={navigationRef}>
              <StatusBar style="light" />
              <RootNavigator />
            </NavigationContainer>
          </NotificationProvider>
        </StoreProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
