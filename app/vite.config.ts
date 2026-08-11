import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

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
  plugins: [saveCut()],
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
