import type { AreaFeature } from '../../types';
import AdmZip from 'adm-zip';

// https://gadm.org/download_country.html
export const level = 1;
export const parent = "CHN";
export const dataurl = 'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_CHN_1.json.zip';

export async function* extractFeatures(buffer: Buffer): AsyncGenerator<AreaFeature> {
  const zip = new AdmZip(buffer);
  const extracted = zip.readFile('gadm41_CHN_1.json');
  if (!extracted) {
    throw new Error('File not found in zip');
  }
  const geojson = JSON.parse(extracted.toString()) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, {NAME_1: string}>;
  for (const feature of geojson.features) {
    if (!feature.properties) {
      console.error(`no property found for ${JSON.stringify(feature)}`);
      continue;
    }
    const name = feature.properties.NAME_1;
    const id = `CHN/${name}`;
    yield {
      type: 'Feature',
      properties: { id, name, level, parent },
      geometry: feature.geometry,
    };
  }
}
