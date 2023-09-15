export type FeatureProperties = {id: string, name: string, parent: string | null, level: number}
export type AreaFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, FeatureProperties>
export interface Module {
  dataurl: string,
  extractFeatures: (buffer: Buffer) => AsyncGenerator<AreaFeature>,
}
