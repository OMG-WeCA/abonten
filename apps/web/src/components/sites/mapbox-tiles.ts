/** Public, URL-restricted token injected into the static web build. */
export const MAPBOX_PUBLIC_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

export const MAPBOX_TILES_URL =
  `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_PUBLIC_TOKEN}`;

/** Opt-in basemap for isolated local reviews that have no Mapbox token. */
export const LOCAL_REVIEW_OSM_MAP =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_LOCAL_REVIEW_OSM_MAP === 'true';

export const SITE_MAP_ENABLED = Boolean(MAPBOX_PUBLIC_TOKEN) || LOCAL_REVIEW_OSM_MAP;
export const SITE_MAP_TILES_URL = LOCAL_REVIEW_OSM_MAP
  ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  : MAPBOX_TILES_URL;
export const SITE_MAP_TILE_OPTIONS = LOCAL_REVIEW_OSM_MAP
  ? {
      tileSize: 256,
      zoomOffset: 0,
      maxZoom: 19,
      crossOrigin: 'anonymous' as const,
      referrerPolicy: 'origin' as const,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }
  : {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 20,
      attribution: '© Mapbox © OpenStreetMap contributors',
    };
