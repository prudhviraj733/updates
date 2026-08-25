import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Truck, Clock, ShieldCheck, Zap } from "lucide-react";
import api from "@/lib/api";
import { Seo } from "@/components/Seo";
import { useStore } from "@/context/StoreContext";
import { ProductCard } from "@/components/store/ProductCard";
import { ComboCarousel } from "@/components/store/ComboCarousel";
import { PersonalizedSection } from "@/components/store/PersonalizedSection";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const navigate = useNavigate();
  const { location } = useStore();
  const [categories, setCategories] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!location) return;
    setLoading(true);
    Promise.all([
      api.get("/categories"),
      api.get(`/products?location_id=${location.id}&featured=true`),
      api.get(`/combo-banners?location_id=${location.id}`),
    ]).then(([c, f, b]) => {
      setCategories(c.data);
      setFeatured(f.data);
      setBanners(b.data);
      setLoading(false);
    });
  }, [location]);

  return (
    <div>
      <Seo
        title=""
        path="/"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "SavingSmart",
          url: typeof window !== "undefined" ? window.location.origin : "https://bestkart.in",
          description: "Online grocery delivery for rice, dals, oils, spices, dry fruits and daily essentials.",
        }}
      />
      {/* Hero */}
      <section className="relative overflow-hidden bg-forest">
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-saffron/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-forest-light/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20 lg:px-8">
          <div className="flex flex-col justify-center">
            <span className="w-fit rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-white">
              Now delivering in {location?.area || "your city"}
            </span>
            <h1 className="mt-5 font-heading text-4xl font-extrabold leading-tight text-white sm:text-5xl lg:text-6xl">
              Fresh groceries & dry fruits, delivered on your schedule
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-white/80">
              Shop rice, dals, oils, spices, nuts and daily essentials. Pick a delivery slot or, in select
              areas, get it in 30 minutes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                data-testid="hero-shop-btn"
                onClick={() => navigate("/products")}
                className="rounded-full bg-saffron px-7 py-6 text-base hover:bg-saffron-dark hover:-translate-y-0.5 transition-transform"
              >
                Start Shopping <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/products")}
                className="rounded-full border-white/30 bg-transparent px-7 py-6 text-base text-white hover:bg-white/10"
              >
                Browse Categories
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-white/80">
              <div className="flex items-center gap-2"><Truck className="h-5 w-5 text-saffron" /><span className="text-sm">Slot delivery</span></div>
              <div className="flex items-center gap-2"><Zap className="h-5 w-5 text-saffron" /><span className="text-sm">Get in 30 Minutes</span></div>
              <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-saffron" /><span className="text-sm">Quality assured</span></div>
            </div>
          </div>
          <div className="hidden items-center justify-center md:flex">
            <div className="grid grid-cols-2 gap-4">
              {categories.slice(0, 4).map((c, i) => (
                <motion.div
                  key={c.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="overflow-hidden rounded-2xl bg-white/10 backdrop-blur"
                >
                  <img src={c.image_url || "https://images.unsplash.com/photo-1656497119922-068c6a5e1193?w=400"} alt={c.name} className="h-36 w-44 object-cover" />
                  <p className="p-3 text-sm font-medium text-white">{c.name}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ComboCarousel banners={banners} />

      <PersonalizedSection />

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between">
          <h2 className="font-heading text-2xl font-bold sm:text-3xl">Shop by category</h2>
          <button onClick={() => navigate("/products")} className="text-sm font-medium text-forest hover:underline">View all</button>
        </div>
        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {categories.map((c) => (
              <button
                key={c.id}
                data-testid={`category-tile-${c.id}`}
                onClick={() => navigate(`/products?category=${c.id}`)}
                className="group overflow-hidden rounded-2xl border border-black/5 bg-white text-left transition-shadow hover:shadow-lg"
              >
                <div className="aspect-[4/3] overflow-hidden bg-forest-light">
                  <img
                    src={c.image_url || "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400"}
                    alt={c.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <p className="p-3 font-medium">{c.name}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">Featured products</h2>
        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* Banner */}
      <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-start gap-4 rounded-3xl bg-saffron/10 p-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-saffron text-white"><Clock className="h-7 w-7" /></div>
            <div>
              <h3 className="font-heading text-xl font-bold">Need it urgently?</h3>
              <p className="text-sm text-muted-foreground">Choose Get in 30 Minutes at checkout where available in your area.</p>
            </div>
          </div>
          <Button onClick={() => navigate("/products")} className="rounded-full bg-forest hover:bg-forest-dark">Shop now</Button>
        </div>
      </section>
    </div>
  );
}
