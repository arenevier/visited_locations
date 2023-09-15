import type { AreaFeature } from '../../types';

// https://github.com/gregoiredavid/france-geojson/
const level = 1;
const parent = "FRA";
export const dataurl = 'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-avec-outre-mer.geojson';
export async function* extractFeatures(buffer: Buffer): AsyncGenerator<AreaFeature> {
  const geojson = JSON.parse(buffer.toString()) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, {nom: string, code: string}>;
  for (const feature of geojson.features) {
    if (!feature.properties) {
      console.error(`no property found for ${JSON.stringify(feature)}`);
      continue;
    }
    if (!feature.properties.code) {
      console.error(`no identifier found for ${JSON.stringify(feature)}`);
      continue;
    }
    const name = feature.properties.nom;
    const id = `FR/DEP_${feature.properties.code}`;
    yield {
      type: 'Feature',
      properties: {id, name, level, parent},
      geometry: feature.geometry,
    };
  }
}
