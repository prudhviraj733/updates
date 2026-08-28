import { forwardRef, useImperativeHandle, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../theme";

// Interactive Leaflet map inside a WebView (mirrors the website MapPicker) — no native
// map dependency needed. Supports "locate me" (device geolocation via the WebView),
// draggable/tap-to-move pin, and best-effort reverse geocoding. Coordinates are posted
// back to React Native via postMessage.
const html = (lat, lng) => {
  const hasC = typeof lat === "number" && typeof lng === "number";
  const start = hasC ? `[${lat},${lng}]` : "[20.5937,78.9629]";
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#map{height:100%;margin:0;padding:0}
#btn{position:absolute;z-index:1000;left:10px;top:10px;background:#1B4332;color:#fff;border:none;padding:9px 14px;border-radius:22px;font:600 13px -apple-system,Roboto,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25)}</style>
</head><body>
<div id="map"></div><button id="btn">Locate me</button>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var hasC=${hasC};var start=${start};
var map=L.map('map').setView(start,hasC?16:4);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
var icon=L.icon({iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',iconSize:[25,41],iconAnchor:[12,41]});
var marker=L.marker(start,{draggable:true,icon:icon}).addTo(map);
function post(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o));}
function send(la,lo){
  post({type:'coords',lat:la,lng:lo});
  fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+la+'&lon='+lo,{headers:{'Accept-Language':'en'}})
    .then(function(r){return r.json()}).then(function(d){var a=d.address||{};
      post({type:'geo',lat:la,lng:lo,pincode:a.postcode||'',city:a.city||a.town||a.village||a.state_district||'',area:a.suburb||a.neighbourhood||a.road||''});
    }).catch(function(){});
}
marker.on('dragend',function(){var p=marker.getLatLng();send(p.lat,p.lng);});
map.on('click',function(e){marker.setLatLng(e.latlng);send(e.latlng.lat,e.latlng.lng);});
function locate(){
  if(!navigator.geolocation){post({type:'denied'});return;}
  navigator.geolocation.getCurrentPosition(function(p){
    var la=p.coords.latitude,lo=p.coords.longitude;marker.setLatLng([la,lo]);map.setView([la,lo],16);send(la,lo);
  },function(){post({type:'denied'});},{enableHighAccuracy:true,timeout:10000,maximumAge:0});
}
window.__locate=locate;document.getElementById('btn').onclick=locate;
setTimeout(function(){map.invalidateSize();},250);
</script></body></html>`;
};

export const MapPickerWebView = forwardRef(function MapPickerWebView(
  { lat, lng, onChange, onGeo, onDenied, style }, ref) {
  const wv = useRef(null);
  useImperativeHandle(ref, () => ({
    locate: () => wv.current && wv.current.injectJavaScript("window.__locate&&window.__locate();true;"),
  }));
  const onMessage = (e) => {
    try {
      const m = JSON.parse(e.nativeEvent.data);
      if (m.type === "coords") onChange && onChange(m.lat, m.lng);
      else if (m.type === "geo") onGeo && onGeo(m);
      else if (m.type === "denied") onDenied && onDenied();
    } catch (_) { /* noop */ }
  };
  return (
    <View style={[styles.wrap, style]}>
      <WebView ref={wv} originWhitelist={["*"]} source={{ html: html(lat, lng) }}
        geolocationEnabled javaScriptEnabled domStorageEnabled onMessage={onMessage}
        startInLoadingState style={{ flex: 1, backgroundColor: "#eee" }} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { height: 240, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
});
