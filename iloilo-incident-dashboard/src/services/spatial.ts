import type { FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson';

export type BarangayProperties = { adm4_psgc: string; adm4_en: string };
export type PolygonCollection = FeatureCollection<Polygon | MultiPolygon, BarangayProperties>;
export type PointCollection = FeatureCollection<Point, BarangayProperties>;
export type CityCollection = FeatureCollection<Polygon | MultiPolygon, { adm3_psgc: string }>;
export type SpatialMetadata = {
  output_crs: string;
  validation: { result: string };
  files: Record<string, { feature_count: number; bbox: [number, number, number, number] }>;
};
export type SpatialData = { barangays: PolygonCollection; nodes: PointCollection; city: CityCollection; metadata: SpatialMetadata };

export async function loadSpatialData(signal: AbortSignal): Promise<SpatialData> {
  const files = ['barangays.geojson', 'barangay_nodes.geojson', 'city_boundary.geojson', 'spatial_metadata.json'];
  const [barangays, nodes, city, metadata] = await Promise.all(files.map(async (file) => {
    const response = await fetch(`/data/${file}`, { signal });
    if (!response.ok) throw new Error('Spatial layer request failed.');
    return response.json();
  }));
  if (metadata.output_crs !== 'EPSG:4326' || metadata.validation?.result !== 'passed') {
    throw new Error('Validated WGS84 geography is required.');
  }
  for (const [index, layer] of [barangays, nodes, city].entries()) {
    if (layer.type !== 'FeatureCollection' || !Array.isArray(layer.features) ||
      layer.features.length !== metadata.files?.[files[index]]?.feature_count) {
      throw new Error('Spatial layer does not match its metadata.');
    }
  }
  return { barangays, nodes, city, metadata };
}
