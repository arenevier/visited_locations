import type { AreaFeature } from '../types';

const level = 0;
const parent = null;
export const dataurl = 'https://datahub.io/core/geo-countries/r/countries.geojson';
export async function* extractFeatures(buffer: Buffer): AsyncGenerator<AreaFeature> {
  const geojson = JSON.parse(buffer.toString()) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, {ADMIN: string, ISO_A3: string}>;
  for (const feature of geojson.features) {
    if (!feature.properties) {
      console.error(`no property found for ${JSON.stringify(feature)}`);
      continue;
    }
    const name = feature.properties.ADMIN;
    let id = feature.properties.ISO_A3;
    // first try to use the iso_a3 code. If it doesn't have one, use the full name
    if (typeof id !== "string" || !id.match(/[a-zA-Z]{3}/)) { // regex: 3 letters
      id = name;
    }
    if (!id) {
      console.error(`no identifier found for ${JSON.stringify(feature)}`);
      continue;
    }
    yield {
      type: 'Feature',
      properties: {id, name, level, parent},
      geometry: feature.geometry,
    };
  }
}
