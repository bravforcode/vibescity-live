import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginVue } from '@rsbuild/plugin-vue';

const { publicVars } = loadEnv({ prefixes: ['VITE_'] });

export default defineConfig({
  plugins: [pluginVue()],
  source: {
    entry: {
      index: './src/main.js',
    },
    define: publicVars,
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
  html: {
    template: './public/index.html',
  },
});
