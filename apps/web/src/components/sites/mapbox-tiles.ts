/** Public, URL-restricted token injected into the static web build. */
export const MAPBOX_PUBLIC_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

export const MAPBOX_TILES_URL =
  `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_PUBLIC_TOKEN}`;
