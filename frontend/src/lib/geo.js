// Geolocation helpers. Location permission is requested only when the customer
// explicitly chooses "Use current location" — never merely to browse the store.

export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      return reject(new Error("Geolocation is not supported on this device"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0, ...options }
    );
  });
}

// Best-effort reverse geocode (OpenStreetMap Nominatim, no API key). Falls back
// to null so the customer can still fill the address manually.
export async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const d = await res.json();
    const a = d.address || {};
    return {
      pincode: a.postcode || "",
      city: a.city || a.town || a.village || a.county || "",
      area: a.suburb || a.neighbourhood || a.residential || a.road || "",
      line1: [a.house_number, a.road].filter(Boolean).join(" "),
    };
  } catch {
    return null;
  }
}

export function geoErrorMessage(err) {
  if (err && err.code === 1) return "Location permission denied. Please enter the address manually.";
  if (err && err.code === 2) return "Location unavailable. Please enter the address manually.";
  if (err && err.code === 3) return "Location request timed out. Please try again or enter it manually.";
  return "Could not get your location. Please enter the address manually.";
}
