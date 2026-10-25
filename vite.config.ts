import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import { fileURLToPath, URL } from 'node:url';
import { mdxOptions } from './mdx.config';

// base: './' + HashRouter → сайт работает на GitHub Pages из любой подпапки
// (https://<user>.github.io/<repo>/) без 404 при обновлении страницы.
export default defineConfig({
  base: './',
  plugins: [
    { enforce: 'pre', ...mdx(mdxOptions) },
    react({ include: /\.(mdx|tsx?)$/ }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
