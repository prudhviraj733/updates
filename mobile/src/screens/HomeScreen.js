import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet, Dimensions, FlatList } from "react-native";
import api, { inr } from "../api/client";
import { useStore } from "../context/StoreContext";

const { width } = Dimensions.get("window");
const BANNER_W = width - 32;
const BANNER_H = Math.round(BANNER_W * (7 / 16));

function ComboCarousel({ banners, navigation }) {
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    const id = setInterval(() => {
      const next = (index + 1) % banners.length;
      setIndex(next);
      listRef.current?.scrollToOffset({ offset: next * (BANNER_W + 12), animated: true });
    }, 4500);
    return () => clearInterval(id);
  }, [index, banners]);

  if (!banners || banners.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <FlatList
        ref={listRef}
        data={banners}
        keyExtractor={(b) => b.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={BANNER_W + 12}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / (BANNER_W + 12)))}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.banner}
            onPress={() => item.package_id && navigation.navigate("Products", { comboId: item.package_id })}
          >
            <Image source={{ uri: item.image_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            <View style={styles.overlay} />
            <View style={styles.bannerContent}>
              {item.promo_text ? <Text style={styles.promo}>{item.promo_text}</Text> : null}
              <Text style={styles.bTitle}>{item.title}</Text>
              {item.subtitle ? <Text style={styles.bSub} numberOfLines={2}>{item.subtitle}</Text> : null}
              {item.package ? (
                <View style={styles.priceRow}>
                  <Text style={styles.price}>{inr(item.package.price)}</Text>
                  {item.package.savings > 0 ? <Text style={styles.save}>Save {inr(item.package.savings)}</Text> : null}
                </View>
              ) : null}
              <View style={styles.cta}><Text style={styles.ctaText}>{item.cta_text || "View Combo"}</Text></View>
            </View>
          </TouchableOpacity>
        )}
      />
      {banners.length > 1 && (
        <View style={styles.dots}>
          {banners.map((_, i) => (
            <View key={i} style={[styles.dot, index === i ? styles.dotActive : null]} />
          ))}
        </View>
      )}
    </View>
  );
}

export default function HomeScreen({ navigation }) {
  const { location } = useStore();
  const [categories, setCategories] = useState([]);
  const [banners, setBanners] = useState([]);

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCategories(data));
    if (location) api.get(`/combo-banners?location_id=${location.id}`).then(({ data }) => setBanners(data));
  }, [location]);

  return (
    <ScrollView style={styles.c}>
      <Text style={styles.loc}>Deliver to: {location?.area || "Select area"}</Text>
      <ComboCarousel banners={banners} navigation={navigation} />
      <Text style={styles.sub}>Shop by category</Text>
      <View style={styles.grid}>
        {categories.map((cat) => (
          <TouchableOpacity key={cat.id} style={styles.card} onPress={() => navigation.navigate("Products", { categoryId: cat.id, name: cat.name })}>
            {cat.image_url ? <Image source={{ uri: cat.image_url }} style={styles.img} /> : <View style={[styles.img, { backgroundColor: "#E8F0E5" }]} />}
            <Text style={styles.cname}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: "#FAF9F6", padding: 16 },
  loc: { color: "#4B5563", fontSize: 12, marginBottom: 12 },
  banner: { width: BANNER_W, height: BANNER_H, borderRadius: 24, overflow: "hidden", marginRight: 12 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  bannerContent: { flex: 1, justifyContent: "center", padding: 18 },
  promo: { alignSelf: "flex-start", backgroundColor: "#D97706", color: "#fff", fontSize: 10, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: "hidden" },
  bTitle: { color: "#fff", fontSize: 22, fontWeight: "800", marginTop: 6 },
  bSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 6 },
  price: { color: "#fff", fontSize: 20, fontWeight: "800" },
  save: { color: "#fff", backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontSize: 12, fontWeight: "700", overflow: "hidden" },
  cta: { alignSelf: "flex-start", backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginTop: 12 },
  ctaText: { color: "#1B4332", fontWeight: "700", fontSize: 12 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "rgba(27,67,50,0.3)" },
  dotActive: { width: 20, backgroundColor: "#1B4332" },
  sub: { fontSize: 16, fontWeight: "700", marginTop: 4, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: { width: "48%", backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, overflow: "hidden" },
  img: { width: "100%", height: 110 },
  cname: { padding: 10, fontWeight: "600" },
});
