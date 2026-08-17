import { useEffect, useState, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { inr } from "@/lib/api";

export function ComboCarousel({ banners }) {
  const navigate = useNavigate();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: "center" });
  const [selected, setSelected] = useState(0);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    onSelect();
  }, [emblaApi, onSelect]);

  // Smooth auto-rotation; pauses on pointer interaction (embla handles drag)
  useEffect(() => {
    if (!emblaApi || !banners || banners.length <= 1) return;
    let timer = setInterval(() => emblaApi.scrollNext(), 4500);
    const stop = () => { clearInterval(timer); };
    const restart = () => { clearInterval(timer); timer = setInterval(() => emblaApi.scrollNext(), 4500); };
    emblaApi.on("pointerDown", stop);
    emblaApi.on("pointerUp", restart);
    return () => { clearInterval(timer); };
  }, [emblaApi, banners]);

  if (!banners || banners.length === 0) return null;

  const go = (b) => { if (b.package_id) navigate(`/combo/${b.package_id}`); };

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8" data-testid="combo-carousel">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {banners.map((b) => (
            <div key={b.id} className="min-w-0 flex-[0_0_100%] px-1.5 sm:flex-[0_0_92%] sm:px-2" data-testid={`combo-banner-${b.id}`}>
              <button
                onClick={() => go(b)}
                className="group relative block w-full overflow-hidden rounded-3xl text-left shadow-sm"
                style={{ aspectRatio: "16 / 7" }}
                data-testid={`combo-banner-btn-${b.id}`}
              >
                <img
                  src={b.image_url}
                  alt={b.title}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />
                {b.package?.savings > 0 && (
                  <div className="absolute right-[-42px] top-5 z-10 rotate-45 bg-saffron px-12 py-1 text-center text-[11px] font-extrabold uppercase tracking-wide text-white shadow-lg" data-testid={`combo-ribbon-${b.id}`}>
                    Save {inr(b.package.savings)}
                  </div>
                )}
                <div className="relative flex h-full max-w-xl flex-col justify-center gap-1.5 p-5 sm:gap-2 sm:p-10">
                  {b.promo_text && (
                    <span className="w-fit rounded-full bg-saffron px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white sm:text-xs">
                      {b.promo_text}
                    </span>
                  )}
                  <h3 className="font-heading text-xl font-extrabold leading-tight text-white sm:text-4xl">{b.title}</h3>
                  {b.subtitle && <p className="line-clamp-2 text-xs text-white/85 sm:text-base">{b.subtitle}</p>}
                  {b.package && (
                    <div className="mt-1 flex items-end gap-2 sm:gap-3">
                      <span className="text-xl font-bold text-white sm:text-3xl">{inr(b.package.price)}</span>
                      {b.package.savings > 0 && (
                        <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold text-white sm:py-1 sm:text-sm" data-testid={`combo-savings-${b.id}`}>
                          Save {inr(b.package.savings)}
                        </span>
                      )}
                    </div>
                  )}
                  <span className="mt-2 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-forest transition-transform group-hover:translate-x-1 sm:mt-3 sm:px-5 sm:py-2.5 sm:text-sm" data-testid={`combo-cta-${b.id}`}>
                    {b.cta_text || "View Combo"} <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </button>
            </div>
          ))}
        </div>
      </div>

      {banners.length > 1 && (
        <div className="mt-4 flex justify-center gap-2" data-testid="combo-dots">
          {banners.map((_, i) => (
            <button
              key={i}
              data-testid={`combo-dot-${i}`}
              onClick={() => emblaApi && emblaApi.scrollTo(i)}
              aria-label={`Go to banner ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-300 ${selected === i ? "w-6 bg-forest" : "w-2 bg-forest/30 hover:bg-forest/50"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
