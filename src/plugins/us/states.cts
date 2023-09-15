import type { AreaFeature } from '../../types';

// https://eric.clst.org/tech/usgeojson/
// Original data from The US Census Bureau
const level = 1;
const parent = "USA";
export const dataurl = 'https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_040_00_500k.json';
export async function* extractFeatures(buffer: Buffer): AsyncGenerator<AreaFeature> {
  const geojson = JSON.parse(buffer.toString()) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { NAME: string, STATE: string }>;
  for (const feature of geojson.features) {
    if (!feature.properties) {
      console.error(`no property found for ${JSON.stringify(feature)}`);
      continue;
    }
    if (!feature.properties.STATE) {
      console.error(`no identifier found for ${JSON.stringify(feature)}`);
      continue;
    }
    const name = feature.properties.NAME;
    const id = `US/${feature.properties.STATE}`;
    yield {
      type: 'Feature',
      properties: { id, name, level, parent },
      geometry: feature.geometry,
    };
  }
}
