import type { AreaFeature } from '../../types';

import shp from 'shpjs';

// https://www12.statcan.gc.ca/census-recensement/2011/geo/bound-limit/bound-limit-2011-eng.cfm
export const level = 1;
export const parent = "CAN";
export const dataurl = 'https://www12.statcan.gc.ca/census-recensement/2011/geo/bound-limit/files-fichiers/gpr_000b11a_e.zip';
export async function* extractFeatures(buffer: Buffer): AsyncGenerator<AreaFeature> {
  let geojson = await shp(buffer) as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { PRENAME: string, PRUID: string }>;
  for (const feature of geojson.features) {
    if (!feature.properties) {
      console.error(`no property found for ${JSON.stringify(feature)}`);
      continue;
    }
    const name = feature.properties.PRENAME;
    const id = `CA/${feature.properties.PRUID}`;
    yield {
      type: 'Feature',
      properties: { id, name, level, parent },
      geometry: feature.geometry,
    };
  }
}
