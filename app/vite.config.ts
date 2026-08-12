import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Dev only: lets the dressing room write its own share card to `public/og.jpg`.
 *
 * The card a link preview shows has to be a real picture of the real garment,
 * and the only thing that knows how to draw the garment is the page. Without
 * this the image would have to come back out through a screenshot — the same
 * lossy loop `/__cut` exists to end, and the same answer.
 *
 * To regenerate: open the dressing room on the dev server, dress her, and POST
 * a data URL of a 1200x630 canvas here —
 *
 *   fetch('/__og', { method: 'POST', body: canvas.toDataURL('image/jpeg', 0.82) })
 *
 * There is no button and no helper on the page, because this runs about once a
 * redesign and a control for it would be a control in everybody's way.
 */
function saveOg(): Plugin {
  return {
    name: 'chupa-save-og',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__og', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            // Just the payload — a data: URL's own prefix is not image data.
            const b64 = body.replace(/^data:image\/\w+;base64,/, '');
            mkdirSync(r('./public'), { recursive: true });
            writeFileSync(r('./public/og.jpg'), Buffer.from(b64, 'base64'));
            res.statusCode = 200;
            res.end('ok');
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

/**
 * Dev only: lets `/dev/cut/` write the traced outline straight into
 * `pattern/panels.json` under `$traced`. Without this the drawing would have to
 * come back through a screenshot, which is the lossy loop the page exists to
 * end. It only ever replaces the `$traced` key.
 */
function saveCut(): Plugin {
  const file = r('../pattern/panels.json');
  return {
    name: 'chupa-save-cut',
    apply: 'serve',
    configureServer(server) {
      // Numbers dialled on the flat page, merged into their groups.
      server.middlewares.use('/__spec', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, any>;
            const patch = JSON.parse(body) as Record<string, Record<string, number>>;
            for (const [group, values] of Object.entries(patch)) {
              doc[group] = { ...doc[group], ...values };
            }
            writeFileSync(file, `${JSON.stringify(doc, null, 2)}
`);
            res.statusCode = 200;
            res.end('ok');
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
      server.middlewares.use('/__cut', (req, res, next) => {
        if (req.method !== 'POST') return next();
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const doc = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
            doc.$traced = JSON.parse(body);
            writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
            res.statusCode = 200;
            res.end('ok');
          } catch (err) {
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      });
    },
  };
}

export default defineConfig({
  // Relative, so the build works at any path — GitHub Pages serves this from
  // /chupa/, a custom domain would serve it from /, and neither needs a rebuild.
  base: './',
  plugins: [saveCut(), saveOg()],
  resolve: {
    alias: {
      '@chupa/cloth': r('../packages/cloth/src/index.ts'),
      '@chupa/body': r('../packages/body/src/index.ts'),
      '@chupa/garment': r('../packages/garment/src/index.ts'),
    },
  },
  server: { fs: { allow: [r('..')] } },
  build: {
    rollupOptions: {
      input: {
        // The dressing room IS the app now, so it sits at the root. The dev
        // pages stay where they are, behind /dev/.
        index: r('./index.html'),
        dev: r('./dev/index.html'),
        pangden: r('./dev/pangden/index.html'),
        mannequin: r('./dev/mannequin/index.html'),
        chupa: r('./dev/chupa/index.html'),
        cut: r('./dev/cut/index.html'),
      },
    },
  },
});
