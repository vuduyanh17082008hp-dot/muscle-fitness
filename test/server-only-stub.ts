// Test-only stand-in for the `server-only` package.
//
// `server-only` isn't a real installed dependency — Next.js's bundler
// has built-in special-case handling for that exact import specifier
// (it throws if a "server-only" marked module is ever pulled into a
// client bundle), which only exists inside Next.js's webpack/turbopack
// pipeline. Vitest has no equivalent, so importing any file that
// starts with `import "server-only"` fails to resolve under plain
// Vite/Vitest. This empty module is aliased in place of it
// (vitest.config.ts) purely so those files can be unit-tested; it has
// no effect on the real Next.js build, which still uses its own
// handling for the genuine package name.
export {};
