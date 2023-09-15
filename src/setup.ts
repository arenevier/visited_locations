import * as fs from 'node:fs';
import * as child_process from 'node:child_process';
import * as path from 'node:path';
import * as stream from 'node:stream';
import * as streamWeb from 'node:stream/web';

import { Client } from 'pg'
import { mkdir, rm, stat, utimes, access, readFile, writeFile, readdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { parseArgs } from 'node:util';

import AdmZip from 'adm-zip';

import { MAIN_PORT, APP_ROOT, PG_OPTIONS } from './constants';

import type { Module, AreaFeature } from './types';

const LEAFLET_ZIP_URL='https://leafletjs-cdn.s3.amazonaws.com/content/leaflet/v1.9.4/leaflet.zip';
const SIMPLEBOX_SCRIPT_URL ='https://raw.githubusercontent.com/arenevier/simplebox/master/js/simplebox.js';
const SIMPLEBOX_ICON_URL ='https://raw.githubusercontent.com/arenevier/simplebox/master/icons/close.png';

function unzip(zip_content: string | Buffer, target_directory: string) {
  const zip = new AdmZip(zip_content);
  zip.extractAllTo(target_directory, true);
}

async function commandExists(command: string): Promise<boolean> {
  const promises = (process.env.PATH ?? "").split(':').map(p => {
    return access(path.join(p, command), fs.constants.X_OK);
  });
  try {
    await Promise.any(promises);
  } catch (e) {
    return false;
  }
  return true;
}

async function* find_files_with_extension(root: string, extension: string): AsyncGenerator<string, void> {
  const dirents = await readdir(root);
  for (const dirent of dirents) {
    const target = path.join(root, dirent);
    const stats = await stat(target);
    if (stats.isDirectory()) {
      yield* find_files_with_extension(target, extension);
    }
    if (stats.isFile() && target.endsWith(`.${extension}`)) {
      yield target;
    }
  }
}

async function download_with_cache(url: string): Promise<Buffer> {
  const hash = createHash("sha256").update(url).digest("hex");

  const cache_directory = path.join(APP_ROOT, 'cache');
  // make sure destination directory is created
  await mkdir(cache_directory, { recursive: true });

  const destination = path.join(cache_directory, hash);

  // set If-Modified-Since header if destination file already exists
  let stats: fs.Stats | undefined;
  try {
    stats = await stat(destination);
  } catch (e) {
    //
  }
  const headers: HeadersInit = {};
  if (stats != null) {
    headers['If-Modified-Since'] = stats.mtime.toUTCString();
  }

  const response = await fetch(url, { headers })
  const { status, ok } = response;
  if (status == 304) {
    // We alread have latest version locally. We are done
    return readFile(destination);
  }

  if (!ok) {
    throw new Error(`error fetching ${url}: status ${status}`);
  }
  if (response.body == null) {
    throw new Error(`error fetching ${url}: no content`);
  }

  // write http response to destination
  const readableStream = stream.Readable.fromWeb(response.body as streamWeb.ReadableStream);
  const writableStream = fs.createWriteStream(destination);
  await pipeline(readableStream, writableStream);

  // update mtime with Last-Modified info
  const last_modified = response.headers.get('Last-Modified');
  if (last_modified != null) {
    await utimes(destination, new Date(), new Date(last_modified));
  }
  return readFile(destination);
}

async function launchWebServer(): Promise<child_process.ChildProcess | null> {
  const existsNpm = await commandExists('npm');
  if (existsNpm) {
    return child_process.spawn('npm', ['run', 'main-dev'], { stdio: 'inherit' });
  }
  const existsYarn = await commandExists('yarn');
  if (existsYarn) {
    return child_process.spawn('yarn', ['run', 'main-dev'], { stdio: 'inherit' });
  }
  return null;
}

async function openURL(url: string): Promise<child_process.ChildProcess | null> {
  const existsXdgOpen = await commandExists('xdg-open');
  if (!existsXdgOpen) {
    return null;
  }
  return child_process.spawn('xdg-open', [url]);
}

// launch an url to visualize the imported data
async function sanityCheck(): Promise<void> {
  if (process.platform !== 'linux') {
    // TODO: support other platforms
    return;
  }
  const server = await launchWebServer();
  if (server == null) {
    return
  }

  const sanityCheckUrl = `http://localhost:${MAIN_PORT}/`;
  const browser = await openURL(sanityCheckUrl);
  if (browser == null) {
    server.kill("SIGINT");
  } else {
    console.log('Application launched. After you verified that it runs correctly, kill the server with Ctrl-C');
  }
}

async function download_simplebox() {
  const [script_content, icon_content] =
    await Promise.all([
      download_with_cache(SIMPLEBOX_SCRIPT_URL),
      download_with_cache(SIMPLEBOX_ICON_URL)
    ]);
  const target_directory = path.join(APP_ROOT, 'static', 'simplebox');

  const script_target_file = path.join(target_directory, 'simplebox.js');
  const icon_target_file = path.join(target_directory, 'icons', 'close.png');

  await mkdir(path.dirname(script_target_file), { recursive: true });
  await mkdir(path.dirname(icon_target_file), { recursive: true });

  await writeFile(script_target_file, script_content);
  await writeFile(icon_target_file, icon_content);
}

async function download_leaflet() {
  const leaflet_content = await download_with_cache(LEAFLET_ZIP_URL);
  const leaflet_target_directory = path.join(APP_ROOT, 'static', 'leaflet');
  await rm(leaflet_target_directory, { recursive: true, force: true });
  unzip(leaflet_content, path.join(APP_ROOT, 'static', 'leaflet'));
}

async function* import_data_from_plugin(script_file: string): AsyncGenerator<AreaFeature> {
  const module: Module = await import(script_file) as Module;
  const content = await download_with_cache(module.dataurl);
  yield* module.extractFeatures(content);
}

async function import_data() {
  const pg_client = new Client(PG_OPTIONS);
  await pg_client.connect()

  const plugins_dir = path.join(APP_ROOT, 'dist', 'plugins');
  for await (const script of find_files_with_extension(plugins_dir, 'cjs')) {
    for await (const feature of import_data_from_plugin(script)) {
      const { name, id, level, parent } = feature.properties;
      if (parent != null && level === 0) {
        throw new Error(`feature ${name} has level 0, and parent ${parent}`);
      }
      if (parent == null && level !== 0) {
        throw new Error(`feature ${name} has level 0, and no parent`);
      }

      const geom = JSON.stringify(feature.geometry);
      const nPoints = feature.geometry.coordinates.flat(3).length / 2;

      // simplify geometry if number of points is too high. Don't simplify if top level (level 0)
      let geomSql;
      if (nPoints >= 100000 && level !== 0) { // Empirically, it will give a layer of 1MB
        geomSql = 'ST_MakeValid(ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($3), 0.005))';
      } else if (nPoints >= 50000 && level !== 0) {
        geomSql = 'ST_MakeValid(ST_SimplifyPreserveTopology(ST_GeomFromGeoJSON($3), 0.001))';
      } else {
        geomSql = 'ST_GeomFromGeoJSON($3)';
      }

      // XXX: the only operation we need is whether a point is inside a polygon/multipolygon. So, we don't need a geography. A geometry will be enough.
      await pg_client.query('INSERT INTO geometries(id, fullname, geom, parent, level) VALUES ($1, $2, ' + geomSql + ', $4, $5) ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom, fullname = EXCLUDED.fullname', [id, name, geom, parent, level]);
    }
  }
  await pg_client.query('UPDATE last_updated SET timestamp = NOW()');
  await pg_client.end();
}

async function debug_plugin(plugin: string) {
  const full_path = await realpath(plugin);
  for await (const feature of import_data_from_plugin(full_path)) {
    const { name, id, level } = feature.properties;
    const geom = JSON.stringify(feature.geometry);
    console.log(`---`);
    console.log(`id: ${id}, name: ${name}, level: ${level}`);
    console.log(`geometry: ${geom}`);
  }
}

async function main() {
  const options = {
    plugin: {
      type: 'string' as const,
      short: "p"
    }
  };
  const { values: { plugin } } = parseArgs({ options });
  if (plugin != null) {
    await debug_plugin(plugin);
    return;
  }

  // main setup
  await Promise.all([import_data(), download_leaflet(), download_simplebox()]);
  await sanityCheck();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main()
