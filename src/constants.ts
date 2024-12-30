import 'dotenv/config';
import type { ClientConfig } from 'pg'
export const MAIN_PORT = 8000;
export const APP_ROOT = process.env.PWD ?? ".";

const DEFAULT_PG_OPTIONS: ClientConfig = { database: 'visited' };
if (process.env.INSIDE_DOCKER === 'true') {
  Object.assign(DEFAULT_PG_OPTIONS, { host: 'postgis', user: 'postgres' });
}
export const PG_OPTIONS = {
  user: DEFAULT_PG_OPTIONS.user ?? process.env.DB_USER,
  database: DEFAULT_PG_OPTIONS.database ?? process.env.DB_NAME,
  port: DEFAULT_PG_OPTIONS.port ?? (process.env.DB_PORT ? parseInt(process.env.DB_PORT) : undefined),
  password: process.env.DB_PASSWORD,
  host: DEFAULT_PG_OPTIONS.host ?? process.env.DB_HOST,
}
