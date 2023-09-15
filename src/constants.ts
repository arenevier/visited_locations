export const MAIN_PORT = 8000;
export const APP_ROOT = process.env.PWD ?? ".";
export const PG_OPTIONS = {database: 'visited'};
if (process.env.INSIDE_DOCKER === 'true') {
  Object.assign(PG_OPTIONS, {host: 'postgis', user: 'postgres'});
}
