import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers, Loader2, MapPin, Search, X } from 'lucide-react';
import { Button, Input, cx } from '../ui';

export interface OtherOfficePin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusM: number;
  active: boolean;
}

export interface LocationMapPickerProps {
  lat: number | null;
  lng: number | null;
  radiusM: number;
  /** Naikkan nilainya (mis. setelah GPS atau pilih preset radius) agar peta fokus menyesuaikan lingkaran. */
  fitKey?: number;
  /** Pusat awal peta saat belum ada pin (mis. kantor aktif pertama atau Jakarta). */
  defaultCenter?: [number, number];
  /** Lokasi kantor lain (ditampilkan samar sebagai acuan di peta). */
  otherLocations?: OtherOfficePin[];
  onPick: (lat: number, lng: number) => void;
}

interface SearchHit {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

type LayerKind = 'osm' | 'sat';

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456];
const TILES: Record<LayerKind, { url: string; attribution: string }> = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
  },
};

/** Pin SVG khusus (tidak memakai PNG bawaan Leaflet yang rawan pecah saat dibundel Vite). */
const PIN_ICON = L.divIcon({
  className: '',
  iconSize: [32, 40],
  iconAnchor: [16, 38],
  html: `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 5px rgba(15,23,42,0.35))">
    <path d="M16 2C8.82 2 3 7.82 3 15c0 9.6 13 23 13 23s13-13.4 13-23C29 7.82 23.18 2 16 2z" fill="#0f766e" stroke="#ffffff" stroke-width="2.5"/>
    <circle cx="16" cy="14.5" r="4.5" fill="#ffffff"/>
  </svg>`,
});

/** Kenali koordinat langsung (-6.21, 106.84) atau tautan Google Maps (@-6.21,106.84 / q=-6.21,106.84). */
function parseCoordinateInput(raw: string): [number, number] | null {
  const s = raw.trim();
  const match =
    s.match(/@(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/) ||
    s.match(/[?&](?:q|ll)=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/) ||
    s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

/**
 * Pemilih titik lokasi kantor & lingkaran radius geofence berbasis Leaflet.
 * Mendukung ketuk peta, geser pin, pencarian alamat/tempel koordinat Google Maps, serta ganti lapisan Peta/Satelit.
 */
export default function LocationMapPicker({
  lat,
  lng,
  radiusM,
  fitKey = 0,
  defaultCenter = DEFAULT_CENTER,
  otherLocations = [],
  onPick,
}: LocationMapPickerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const othersRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const hadPinRef = useRef(lat !== null && lng !== null);
  const lastFitKeyRef = useRef(fitKey);

  const [layer, setLayer] = useState<LayerKind>('osm');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasPin = lat !== null && lng !== null;
  const safeRadius = Number.isFinite(radiusM) && radiusM >= 20 ? Math.min(5000, radiusM) : 100;

  // Inisialisasi peta Leaflet sekali saat komponen terpasang.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const initCenter: [number, number] = lat !== null && lng !== null ? [lat, lng] : defaultCenter;
    const map = L.map(el, {
      center: initCenter,
      zoom: lat !== null && lng !== null ? 17 : 13,
      zoomControl: true,
      attributionControl: true,
    });
    const tiles = L.tileLayer(TILES.osm.url, { maxZoom: 19, attribution: TILES.osm.attribution }).addTo(map);
    const others = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current(e.latlng.lat, e.latlng.lng);
      if (map.getZoom() < 15) map.setView(e.latlng, 17, { animate: true });
    });

    mapRef.current = map;
    tileRef.current = tiles;
    othersRef.current = others;

    // Pastikan ukuran peta dihitung ulang setelah animasi Sheet selesai agar tile tidak terpotong.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    const t = window.setTimeout(() => map.invalidateSize(), 200);

    return () => {
      window.clearTimeout(t);
      ro.disconnect();
      abortRef.current?.abort();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
      othersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ganti lapisan Peta Jalan / Satelit.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    const cfg = TILES[layer];
    tileRef.current = L.tileLayer(cfg.url, { maxZoom: 19, attribution: cfg.attribution }).addTo(map);
    tileRef.current.bringToBack();
  }, [layer]);

  // Tampilkan lokasi kantor lain secara samar sebagai acuan.
  useEffect(() => {
    const group = othersRef.current;
    if (!group) return;
    group.clearLayers();
    for (const o of otherLocations) {
      L.circle([o.lat, o.lng], {
        radius: o.radiusM,
        color: '#64748b',
        weight: 1.5,
        dashArray: '4 4',
        fillColor: '#94a3b8',
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(group);
      L.circleMarker([o.lat, o.lng], {
        radius: 4,
        color: '#475569',
        fillColor: '#ffffff',
        fillOpacity: 1,
        weight: 2,
      })
        .bindTooltip(`${o.name} (${o.radiusM} m)`, { direction: 'top', offset: [0, -6] })
        .addTo(group);
    }
  }, [otherLocations]);

  // Sinkronkan posisi pin dan ukuran lingkaran radius setiap nilai berubah.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (lat === null || lng === null) {
      markerRef.current?.remove();
      circleRef.current?.remove();
      markerRef.current = null;
      circleRef.current = null;
      hadPinRef.current = false;
      return;
    }

    const pos: L.LatLngExpression = [lat, lng];
    let circle = circleRef.current;
    let marker = markerRef.current;

    if (!circle) {
      circle = L.circle(pos, {
        radius: safeRadius,
        color: '#0f766e',
        weight: 2,
        fillColor: '#14b8a6',
        fillOpacity: 0.2,
      }).addTo(map);
      circleRef.current = circle;
    } else {
      circle.setLatLng(pos);
      circle.setRadius(safeRadius);
    }

    if (!marker) {
      marker = L.marker(pos, { icon: PIN_ICON, draggable: true }).addTo(map);
      marker.on('drag', () => {
        const p = marker!.getLatLng();
        circleRef.current?.setLatLng(p);
      });
      marker.on('dragend', () => {
        const p = marker!.getLatLng();
        onPickRef.current(p.lat, p.lng);
      });
      markerRef.current = marker;
    } else {
      marker.setLatLng(pos);
    }

    const fitTriggered = fitKey !== lastFitKeyRef.current;
    const firstPin = !hadPinRef.current;
    lastFitKeyRef.current = fitKey;
    hadPinRef.current = true;

    const bounds = circle.getBounds();
    // Sesuaikan zoom saat pin pertama muncul, tombol GPS/cari/preset dipakai, atau lingkaran melebar keluar layar.
    if (firstPin || fitTriggered || !map.getBounds().contains(bounds)) {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 18, animate: !firstPin });
    }
  }, [lat, lng, safeRadius, fitKey]);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setSearchMsg(null);
    setHits([]);

    // Bila pengguna menempel koordinat atau tautan Google Maps, langsung pindah tanpa panggil jaringan.
    const parsed = parseCoordinateInput(q);
    if (parsed) {
      onPick(parsed[0], parsed[1]);
      setSearchMsg(`Pin dipindah ke ${parsed[0].toFixed(5)}, ${parsed[1].toFixed(5)}.`);
      const map = mapRef.current;
      if (map) {
        const c = circleRef.current;
        if (c) map.fitBounds(L.latLng(parsed[0], parsed[1]).toBounds(safeRadius * 2), { padding: [28, 28], maxZoom: 18 });
        else map.setView(parsed, 17);
      }
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    try {
      const fetchHits = async (country: boolean) => {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=0${country ? '&countrycodes=id' : ''}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'Accept-Language': 'id' } });
        if (!res.ok) throw new Error('Gagal mencari lokasi');
        return (await res.json()) as SearchHit[];
      };
      let list = await fetchHits(true);
      if (list.length === 0) list = await fetchHits(false);
      setHits(list);
      if (list.length === 0) setSearchMsg('Lokasi tidak ditemukan. Coba nama jalan/kecamatan atau ketuk peta langsung.');
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setSearchMsg('Pencarian alamat sedang tidak tersedia. Geser dan ketuk peta langsung.');
    } finally {
      setSearching(false);
    }
  }

  function pickHit(h: SearchHit) {
    const la = Number(h.lat), lo = Number(h.lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) return;
    onPick(la, lo);
    setHits([]);
    setSearchMsg(null);
    const map = mapRef.current;
    if (map) {
      map.fitBounds(L.latLng(la, lo).toBounds(safeRadius * 2), { padding: [28, 28], maxZoom: 18 });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type="search"
            aria-label="Cari alamat atau tempel koordinat"
            placeholder="Cari jalan/gedung atau tempel koordinat"
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) { setHits([]); setSearchMsg(null); } }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }}
            className="pr-10 text-sm"
          />
          {query && (
            <button
              type="button"
              aria-label="Bersihkan pencarian"
              onClick={() => { setQuery(''); setHits([]); setSearchMsg(null); }}
              className="absolute inset-y-0 right-0 grid w-10 cursor-pointer place-items-center text-muted hover:text-fg"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <Button type="button" variant="secondary" loading={searching} disabled={!query.trim()} onClick={() => void runSearch()} className="shrink-0 px-3 text-sm">
          {!searching && <Search className="size-4" aria-hidden="true" />}Cari
        </Button>
      </div>

      {hits.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface text-sm shadow-sm">
          {hits.map((h) => (
            <li key={h.place_id}>
              <button
                type="button"
                onClick={() => pickHit(h)}
                className="flex min-h-11 w-full cursor-pointer items-start gap-2 px-3 py-2 text-left hover:bg-sub active:bg-sub"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="line-clamp-2">{h.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchMsg && <p role="status" className="text-xs text-muted">{searchMsg}</p>}

      <div className="relative isolate h-72 w-full overflow-hidden rounded-2xl border border-line bg-sub sm:h-80">
        <div ref={hostRef} className="size-full z-0" aria-label="Peta pilih lokasi kantor" />
        <div
          role="group"
          aria-label="Tampilan peta"
          className="absolute top-2.5 right-2.5 z-[450] flex items-center gap-0.5 rounded-xl bg-surface/95 p-1 shadow-card backdrop-blur-xs"
        >
          <Layers className="mx-1.5 size-3.5 text-muted" aria-hidden="true" />
          {([['osm', 'Peta'], ['sat', 'Satelit']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={layer === k}
              onClick={() => setLayer(k)}
              className={cx(
                'min-h-8 cursor-pointer rounded-lg px-2.5 text-xs font-semibold transition-colors',
                layer === k ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-sub hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {!hasPin && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[450] flex justify-center">
            <span className="rounded-full bg-black/75 px-3 py-1.5 text-center text-xs font-medium text-white shadow">
              Ketuk peta untuk menaruh pin kantor
            </span>
          </div>
        )}
        {searching && (
          <div className="pointer-events-none absolute inset-0 z-[450] grid place-items-center bg-black/10">
            <span className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-xs font-medium shadow-card">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />Mencari lokasi…
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-muted">
        {hasPin
          ? `Pin di ${lat.toFixed(6)}, ${lng.toFixed(6)} · lingkaran hijau menampilkan area radius ${safeRadius} m. Geser pin atau ketuk titik lain untuk memindahkan.`
          : 'Cari alamat, tekan "Pakai lokasi saya", atau ketuk langsung di peta untuk menentukan titik kantor.'}
      </p>
    </div>
  );
}
