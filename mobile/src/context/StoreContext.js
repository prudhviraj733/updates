import { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../api/client";

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    api.get("/locations").then(async ({ data }) => {
      setLocations(data);
      const saved = await AsyncStorage.getItem("location_id");
      const found = data.find((l) => l.id === saved) || data[0];
      if (found) {
        setLocation(found);
        await AsyncStorage.setItem("location_id", found.id);
      }
    });
  }, []);

  return <StoreContext.Provider value={{ locations, location, setLocation }}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
