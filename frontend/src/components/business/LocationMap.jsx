import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// One pin on a small map, for a business that has coordinates (Business.lat/
// lng — the seed source's own point, never geocoded). Loaded lazily from
// ContactDetails, so Leaflet only downloads on a profile that has a pin.
//
// TILES come straight from the provider to the browser; none of it passes
// through our server. OpenStreetMap's own tile server is fine at today's
// traffic under its usage policy (attribution shown, no bulk fetching). Before
// launch traffic, move to a keyed provider (MapTiler / Stadia free tier) —
// it's this one URL.
const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
// The tile credit is the one condition of using OpenStreetMap's tiles, so it
// stays. Credit for where the LISTING data came from is a separate, pre-launch
// item (ABRI-data-sources.md → Attribution) and deliberately isn't here yet.
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// A circle rather than Leaflet's default marker: the default is an image whose
// path bundlers break, and a circle in the ink colour matches the page anyway.
const PIN = { radius: 8, color: "#ffffff", weight: 2, fillColor: "#141413", fillOpacity: 1 };

function LocationMap({ lat, lng, label }) {
  const el = useRef(null);

  useEffect(() => {
    const map = L.map(el.current, {
      center: [lat, lng],
      zoom: 16,
      // The map sits in a scrolling page: a wheel over it should scroll the
      // page, not zoom the map out from under the reader.
      scrollWheelZoom: false,
    });
    // Leaflet's own "Leaflet" link is optional (its licence doesn't ask for
    // it); only the tile credit is required.
    map.attributionControl.setPrefix(false);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    L.circleMarker([lat, lng], PIN).addTo(map).bindTooltip(label);
    return () => map.remove();
  }, [lat, lng, label]);

  return (
    <div
      ref={el}
      role="img"
      aria-label={`Map showing where ${label} is`}
      className="isolate h-52 w-full overflow-hidden rounded-xl border border-grey-200 dark:border-border"
    />
  );
}

export default LocationMap;
