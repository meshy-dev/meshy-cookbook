export default {
  base: "./", // relative asset URLs, so dist/ works from any folder on a static host
  build: { chunkSizeWarningLimit: 1000 }, // three.js alone is about 650 kB minified
};
