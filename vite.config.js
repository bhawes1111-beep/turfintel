import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
//
// Phase: Legacy Browser Compatibility
//
// Public surfaces (notably /display-board/board) must run on the
// Crossroads GC kiosk Chromebit (ChromeOS 79 / Chrome 79). Vite's
// modern build defaults emit ES2020+ which Chrome 79 cannot parse —
// the kiosk console threw `Uncaught SyntaxError: Unexpected token '>'`
// (an arrow function in a worker chunk).
//
// @vitejs/plugin-legacy emits a parallel set of ES5-compatible
// chunks + a Babel-transpiled polyfill bundle and injects a runtime
// loader that picks the modern or legacy bundle based on the user
// agent. Modern browsers (Crosswinds-issued tablets, employee
// phones, the supervisor laptops) keep getting the small modern
// bundle; the kiosk + any other legacy device gets the polyfilled
// fallback.
export default defineConfig({
  plugins: [
    react(),
    legacy({
      // Browserslist query that matches Chrome 79. `defaults` also
      // covers >= 0.5% global usage with last 2 versions of each
      // major browser so this protects against any other older
      // device in the field.
      targets: ['chrome >= 79', 'defaults'],
      // Inject the core-js polyfills needed for ES2020+ features
      // emitted by React 19 + react-router-dom 7 (optional chaining,
      // nullish coalescing, dynamic import, BigInt).
      modernPolyfills: true,
      // Detect legacy browsers via UA and serve them the polyfilled
      // bundle (default true — included here for explicitness).
      renderLegacyChunks: true,
    }),
  ],
})
