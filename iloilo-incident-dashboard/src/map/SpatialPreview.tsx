import { useEffect, useRef, useState } from 'react';
import { Map, AttributionControl, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import spatialWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { SpatialData } from '../services/spatial';
import { Icon } from '../components/Icon';
import 'maplibre-gl/dist/maplibre-gl.css';

// Bundle the MapLibre 6 module worker explicitly; Vite dependency optimization
// otherwise changes the base URL used by the library's relative worker import.
setWorkerUrl(spatialWorkerUrl);

type Props = {
  data: SpatialData;
  selectedId: string;
  onSelect: (id: string) => void;
  showPolygons: boolean;
  showPoints: boolean;
  showBoundary: boolean;
  counts: Record<string, number>;
};

export default function SpatialPreview({ data, counts, selectedId, onSelect, showPolygons, showPoints, showBoundary }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const fitRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!container.current) return;
    let map: Map;
    try {
      map = new Map({
        container: container.current,
        style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#0c1215' } }] },
        attributionControl: false,
        cooperativeGestures: true,
        dragRotate: false,
        pitchWithRotate: false,
        maxPitch: 0,
        maxZoom: 17,
        canvasContextAttributes: { antialias: true },
      });
    } catch {
      // Provide a textual data alternative when a device cannot create WebGL.
      // Defer to an event so effect initialization does not synchronously set state.
      const timeout = window.setTimeout(() => setFailed(true), 0);
      return () => window.clearTimeout(timeout);
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new AttributionControl({ compact: false, customAttribution: 'Local validated geography · No external basemap' }), 'bottom-left');
    const fit = () => {
      if (!container.current) return;
      const wide = window.matchMedia('(min-width: 1001px)').matches;
      const [west, south, east, north] = data.metadata.files['city_boundary.geojson'].bbox;
      map.fitBounds([[west, south], [east, north]], {
        padding: wide ? { top: 70, right: 285, bottom: 110, left: 330 } : { top: 65, right: 66, bottom: 65, left: 28 },
        duration: 0,
      });
    };
    fitRef.current = fit;
    const observer = new ResizeObserver(() => { map.resize(); fit(); });
    observer.observe(container.current);
    map.on('error', () => setFailed(true));
    map.on('load', () => {
      map.addSource('barangays', { type: 'geojson', data: data.barangays });
      map.addSource('nodes', { type: 'geojson', data: data.nodes });
      map.addSource('city', { type: 'geojson', data: data.city });
      map.addLayer({ id: 'barangay-fill', type: 'fill', source: 'barangays', paint: { 'fill-color': ['step', ['coalesce', ['get', 'published_count'], 0], '#23363b', 1, '#24565f', 3, '#397c88', 10, '#65c7ff'], 'fill-opacity': 0.84 } });
      map.addLayer({ id: 'barangay-lines', type: 'line', source: 'barangays', paint: { 'line-color': '#587078', 'line-width': 0.65, 'line-opacity': 0.8 } });
      map.addLayer({ id: 'selected-fill', type: 'fill', source: 'barangays', filter: ['==', ['get', 'adm4_psgc'], ''], paint: { 'fill-color': '#d9ff68', 'fill-opacity': 0.25 } });
      map.addLayer({ id: 'selected-line', type: 'line', source: 'barangays', filter: ['==', ['get', 'adm4_psgc'], ''], paint: { 'line-color': '#d9ff68', 'line-width': 2 } });
      map.addLayer({ id: 'city-line', type: 'line', source: 'city', paint: { 'line-color': '#9baeb3', 'line-width': 1.3, 'line-opacity': 0.8 } });
      map.addLayer({ id: 'points', type: 'circle', source: 'nodes', layout: { visibility: 'none' }, paint: { 'circle-color': '#65c7ff', 'circle-radius': 2.3, 'circle-stroke-width': 1, 'circle-stroke-color': '#0c1215' } });
      map.on('click', 'barangay-fill', (event) => {
        const id = event.features?.[0]?.properties?.adm4_psgc;
        if (typeof id === 'string') onSelect(id);
      });
      map.on('mouseenter', 'barangay-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'barangay-fill', () => { map.getCanvas().style.cursor = ''; });
      map.getCanvas().setAttribute('aria-label', 'Iloilo City barangay map. Use the barangay selector for a keyboard-accessible alternative.');
      fit();
      // The style's load event precedes asynchronous GeoJSON processing.
      // Announce readiness only once source processing and the first paint finish.
      map.once('idle', () => setReady(true));
    });
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, [data, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const layer of ['selected-fill', 'selected-line']) map.setFilter(layer, ['==', ['get', 'adm4_psgc'], selectedId]);
    for (const layer of ['barangay-fill', 'barangay-lines']) map.setLayoutProperty(layer, 'visibility', showPolygons ? 'visible' : 'none');
    map.setLayoutProperty('points', 'visibility', showPoints ? 'visible' : 'none');
    map.setLayoutProperty('city-line', 'visibility', showBoundary ? 'visible' : 'none');
  }, [ready, selectedId, showBoundary, showPoints, showPolygons]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource('barangays') as GeoJSONSource).setData({ ...data.barangays, features: data.barangays.features.map((feature) => ({ ...feature, properties: { ...feature.properties, published_count: counts[feature.properties.adm4_psgc] ?? 0 } })) });
  }, [counts, data, ready]);

  return (
    <>
      <div ref={container} className="map-canvas" role="region" aria-label="Iloilo City spatial preview" />
      {(!ready || failed) && <div className="map-render-status" role="status">{failed ? 'Map rendering is unavailable on this device. Validated geography remains available in the layer panel.' : 'Drawing barangay geography…'}</div>}
      <div className="map-controls" role="group" aria-label="Map view controls">
        <span className="north-marker" aria-label="Map orientation: north up">N<span aria-hidden="true">↑</span></span>
        <button className="icon-button" disabled={!ready || failed} onClick={() => mapRef.current?.zoomIn({ duration: 0 })} aria-label="Zoom in"><Icon name="plus" /></button>
        <button className="icon-button" disabled={!ready || failed} onClick={() => mapRef.current?.zoomOut({ duration: 0 })} aria-label="Zoom out"><Icon name="minus" /></button>
        <button className="icon-button" disabled={!ready || failed} onClick={() => fitRef.current()} aria-label="Fit Iloilo City boundary"><Icon name="target" /></button>
      </div>
    </>
  );
}
