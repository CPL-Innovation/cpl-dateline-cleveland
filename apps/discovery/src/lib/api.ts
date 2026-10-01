// Where the pipeline API lives, as seen from this page.
//
// On this machine (localhost, or a LAN address) the API is its own server on
// :5170, called directly — as it always has been. Anywhere else (a public tunnel
// to the dev server) there is only the one address, so calls stay same-origin
// and the Vite dev server proxies /api to :5170 — through a gate that lets only
// the patron routes past (vite.config.ts).
const DIRECT = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/;

export const API = (): string =>
  DIRECT.test(location.hostname) ? 'http://' + location.hostname + ':5170' : '';
