// Native-module fallback for static hosting. The production build replaces
// this small loader with a bundled same-origin entrypoint when esbuild is present.
import '../../src/application/auth-entrypoint.js';
