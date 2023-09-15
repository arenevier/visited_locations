import * as path from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

import Koa from 'koa';
import Router from 'koa-router';
import serve from 'koa-static';
import compress from 'koa-compress';
import bodyParser from 'koa-bodyparser';
import Pug from 'koa-pug';


import { Client, QueryResult } from 'pg'

import type { FeatureProperties, AreaFeature } from './types';
import * as logger from './logger';
import { registerCleanupMethod } from './utils';

import { MAIN_PORT, PG_OPTIONS, APP_ROOT } from './constants';

type CustomRouterState = { lastModifiedData: Date, locale: { [key: string]: string } };

async function lastUpdatedData(pg_client: Client): Promise<Date> {
  const result: QueryResult<{ timestamp: Date }> = await pg_client.query('SELECT timestamp FROM last_updated');
  if (result.rows.length !== 1) {
    throw new Error("cannot get last updated timestamp");
  }
  return result.rows[0].timestamp;
}

function generateRandomString(length: number): string {
  const aCode = 'a'.charCodeAt(0);
  const getRandomCharCode = () => {
    return (aCode + Math.floor(Math.random() * 26));
  };

  return String.fromCharCode(...[...(Array(length).keys())].map(getRandomCharCode));
}

const lastModified: Router.IMiddleware<CustomRouterState> = async function(ctx, next: Koa.Next) {
  const lastModifiedData = ctx.state.lastModifiedData;
  const ifModifiedSince = ctx.request.get('if-modified-since');
  if (ifModifiedSince != null) {
    if (new Date(ifModifiedSince) >= lastModifiedData) {
      ctx.response.status = 304;
      return;
    }
  }
  await next();
  if (ctx.response.status === 200) {
    ctx.response.lastModified = lastModifiedData;
  }
}

async function allLocales(): Promise<{ [value: string]: string }> {
  const locales_directory = path.join(APP_ROOT, 'locales');
  const result: { [value: string]: string } = {};

  const enLocale = await readFile(path.join(locales_directory, 'en.json'));
  result['en'] = JSON.parse(enLocale.toString());

  const dirents = await readdir(locales_directory);
  for (const dirent of dirents) {
    const target = path.join(locales_directory, dirent);
    const parsed_path = path.parse(target);
    if (parsed_path.ext !== '.json') {
      continue;
    }
    const locale_name = parsed_path.name;
    if (locale_name === 'en') {
      continue;
    }
    const buffer = await readFile(target);
    const json = JSON.parse(buffer.toString());
    Object.keys(result['en']).forEach((key) => {
      if (!json.hasOwnProperty(key)) {
        throw new Error(`property ${key} is defined in default locale, but not in ${locale_name} locale`);
      }
    })
    result[locale_name] = JSON.parse(buffer.toString());
  }

  return result;
}

async function main() {
  await logger.init(true);
  logger.log('app starting');
  const pg_client = new Client(PG_OPTIONS);
  await pg_client.connect();
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  registerCleanupMethod(() => { pg_client.end(); });

  const lastModifiedData = await lastUpdatedData(pg_client);
  const data = { lastModifiedData };
  const locales = await allLocales();

  const app = new Koa();

  app.use(function(ctx, next) {
    ctx.locale = 'en';
    return next();
  })

  const featureRoute: Router.IMiddleware = async function(ctx, _next: Koa.Next) {
    const id = ctx.request.query.id;
    if (typeof id !== "string") {
      ctx.response.status = 400;
      return;
    }
    const queryResult: QueryResult<FeatureProperties & { geom: string }> = await pg_client.query('SELECT id, fullname as name, ST_AsGeoJSON(geom) AS geom, parent, level FROM geometries WHERE id = $1', [id]);
    if (queryResult.rows.length === 0) {
      ctx.response.status = 404;
      return;
    }
    const rowResult = queryResult.rows[0];

    const feature: AreaFeature = {
      type: 'Feature',
      geometry: JSON.parse(rowResult.geom),
      properties: {
        id,
        name: rowResult.name,
        level: rowResult.level,
        parent: rowResult.parent,
      }
    }
    ctx.body = feature;
  }

  const hittestRoute: Router.IMiddleware = async function(ctx, _next: Koa.Next) {
    const latAsString = ctx.request.query.lat;
    const lngAsString = ctx.request.query.lng;
    const parent = ctx.request.query.parent;
    if (typeof latAsString !== "string" || typeof lngAsString !== "string") {
      ctx.response.status = 400;
      return;
    }
    const lat = parseFloat(latAsString);
    const lng = parseFloat(lngAsString);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      ctx.response.status = 400;
      return;
    }

    let result: QueryResult<{ id: string, name: string }>;
    if (parent == null) {
      result = await pg_client.query('SELECT id, fullname as name FROM geometries WHERE ST_Contains(geom, ST_SetSRID(ST_Point($1, $2), 4326)) AND parent IS NULL', [lng, lat]);
    } else {
      result = await pg_client.query('SELECT id, fullname as name FROM geometries WHERE ST_Contains(geom, ST_SetSRID(ST_Point($1, $2), 4326)) AND parent = $3', [lng, lat, parent]);
    }
    if (result.rows.length == 0) {
      ctx.response.status = 404;
      return;
    }
    const feature = result.rows[0];
    if (result.rows.length > 1) {
      logger.error("multiple results for location", lat, lng);
    }
    logger.log(`found in ${feature.name}`);
    ctx.body = feature.id;
  }

  const saveRoute: Router.IMiddleware = async function(ctx, _next: Koa.Next) {
    let retry = 0;
    let success = false;
    let id = null;
    while (retry < 20) {
      id = generateRandomString(12);
      try {
        await pg_client.query('INSERT INTO saves (id, geometries) VALUES ($1, $2)', [id, ctx.request.body]);
        success = true;
        break;
      } catch (e) {
        retry++;
      }
    }
    if (success) {
      ctx.body = JSON.stringify({ id });
    } else {
      ctx.response.status = 500;
    }
  }

  const apiRouter = new Router({
    prefix: '/api'
  });
  apiRouter.use(async (ctx, next) => {
    ctx.state.lastModifiedData = data.lastModifiedData;
    await next();
  });

  apiRouter.get('/feature', lastModified, featureRoute)
    .get('/hittest', hittestRoute)
    .post('/save', saveRoute);


  new Pug({
    viewPath: './html',
    basedir: './html',
    app: app
  });


  const mainRouter = new Router();
  mainRouter.use((ctx, next) => {
    // first, check if "lng" query param is set
    const lang_from_request = ctx.request.query.lng;
    if (typeof lang_from_request === "string" && locales[lang_from_request] != null) {
      ctx.state.locale = locales[lang_from_request];
      return next();
    }
    // then, check Accept-Language
    const lang_from_accept = ctx.acceptsLanguages(Object.keys(locales));
    if (typeof lang_from_accept === "string" && locales[lang_from_accept] != null) {
      ctx.state.locale = locales[lang_from_accept];
      return next();
    }
    // if we havent' found anything, default to en
    ctx.state.locale = locales['en'];
    return next();
  });

  mainRouter.get('/', async (ctx, _next) => {
    await ctx.render('index', { gInitialFeatures: [], gI18n: ctx.state.locale });
  })
    .get('/:id', async (ctx, _next) => {
      // XXX: we order by level to make sure that on the FE side, the child is always added to the the featureset after the parent. 
      // TODO: find a better way to ensure parent is defined properly in the featureset
      const geometries: QueryResult<FeatureProperties & { geom: string }> = await pg_client.query('SELECT geometries.id, fullname AS name, ST_AsGeoJSON(geom) AS geom,parent, level from geometries join saves on geometries.id = any(saves.geometries) where saves.id = $1 ORDER BY level', [ctx.params.id]);
      if (geometries.rows.length === 0) {
        ctx.response.status = 404;
        return;
      }

      const features: Array<AreaFeature> = geometries.rows.map((row) => {
        return {
          type: 'Feature',
          geometry: JSON.parse(row.geom),
          properties: {
            id: row.id,
            name: row.name,
            level: row.level,
            parent: row.parent,
          }
        }
      });
      await ctx.render('index', { gInitialFeatures: features, gI18n: ctx.state.locale });
    });

  app.use(serve("static"));
  app.use(mainRouter.routes());
  app.use(serve("html"));
  app.use(compress());
  app.use(bodyParser());
  app.use(apiRouter.routes()).use(apiRouter.allowedMethods());
  app.listen(MAIN_PORT);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
