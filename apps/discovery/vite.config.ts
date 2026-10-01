import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Patron routes a visitor through a public tunnel may reach (method + path).
// Everything else on the pipeline API — the workbench's writes, ingestion,
// settings, spend — answers only on this machine.
const PUBLIC_API: Array<[string, string]> = [
  ['GET', '/api/discovery'], ['GET', '/api/shelf'],
  ['POST', '/api/chat'],
  ['GET', '/api/edition/index'], ['POST', '/api/edition/prompts'], ['POST', '/api/edition/section'],
  ['GET', '/api/podcast'], ['POST', '/api/podcast'], ['GET', '/api/podcast/audio'], ['POST', '/api/podcast/retry'],
];
// The staff workbench and the data only it reads.
const STAFF_PAGE = /^\/(staff(\/.*)?|staff\.html|staff-dashboard\.html|staff-run\.json|catalog\.json)$/;

/**
 * The gate for a temporary public tunnel (cloudflared). Cloudflare stamps every
 * request it forwards with `cf-connecting-ip`; a request without it came from
 * this machine or the LAN and passes untouched. A tunnelled one gets the patron
 * site and the patron API above — nothing else.
 */
function tunnelGate(): Plugin {
  return {
    name: 'dateline-tunnel-gate',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.headers['cf-connecting-ip']) return next();
        const raw = (req.url ?? '/').split('?')[0];
        // Judge the path the way the file server and the proxy will read it:
        // decoded, slashes collapsed, dot-segments resolved, case folded (the
        // disk is case-insensitive). Anything that won't decode is refused.
        let path: string | null = null;
        try {
          path = new URL(decodeURIComponent(raw).replace(/\\/g, '/').replace(/\/{2,}/g, '/'), 'http://x').pathname
            .toLowerCase().replace(/\/+$/, '') || '/';
        } catch { path = null; }
        const api = path === null || path.startsWith('/api');
        // An API call must ALSO arrive spelled exactly as allowed, so what reaches
        // the proxy is the very string that was checked.
        const allowed = path !== null && (api
          ? PUBLIC_API.some(([m, p]) => m === req.method && p === raw)
          : !STAFF_PAGE.test(path));
        if (allowed) return next();
        res.statusCode = 403;
        if (api) {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'Not available over the public link.' }));
        } else {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            + '<title>Not available</title><body style="font:17px/1.6 Georgia,serif;color:#2B3340;max-width:560px;margin:80px auto;padding:0 16px">'
            + '<h1 style="font-size:24px;color:#0F1215">The staff workbench isn’t available over this link.</h1>'
            + '<p>This is a temporary public preview of the patron site. <a href="/" style="color:#0057B7">Back to Dateline Cleveland →</a></p>');
        }
      });
    },
  };
}

// Desktop-only patron-discovery SPA. Base is relative so the built
// bundle can be dropped into out/ or any static host without rewrites.
export default defineConfig({
  base: './',
  plugins: [react(), tunnelGate()],
  server: {
    port: 5180,
    open: true,
    // A quick tunnel's random https://….trycloudflare.com host, in addition to localhost.
    allowedHosts: ['.trycloudflare.com'],
    // Off-machine, the patron app calls /api on its own origin (src/lib/api.ts);
    // the gate above has already decided whether it may.
    proxy: { '/api': { target: 'http://localhost:5170', changeOrigin: true } },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
