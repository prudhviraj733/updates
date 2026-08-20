import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Use CDN marker assets so the bundler doesn't need to resolve leaflet images.
const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});

export function MapPicker({ lat, lng, onChange }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const hasCoords = typeof lat === "number" && typeof lng === "number";
  const center = hasCoords ? [lat, lng] : [20.5937, 78.9629];

  useEffect(() => {
    if (mapRef.current || !el.current) return;
    const map = L.map(el.current).setView(center, hasCoords ? 16 : 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    const marker = L.marker(center, { draggable: true, icon: markerIcon }).addTo(map);
    marker.on("dragend", () => { const p = marker.getLatLng(); onChange(p.lat, p.lng); });
    map.on("click", (e) => { marker.setLatLng(e.latlng); onChange(e.latlng.lat, e.latlng.lng); });
    mapRef.current = map;
    markerRef.current = marker;
    setTimeout(() => map.invalidateSize(), 200);
    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapRef.current && markerRef.current && hasCoords) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng], Math.max(mapRef.current.getZoom(), 16));
    }
  }, [lat, lng, hasCoords]);

  return <div ref={el} data-testid="map-picker" className="h-56 w-full overflow-hidden rounded-xl border border-black/10" />;
}
