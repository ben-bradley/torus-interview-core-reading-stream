# AGENTS

## Environment & scripts
- Use **Node.js >= 22.18** (ESM project; Node runs `.ts` files directly).
- Do **not** add dependencies or run an install step unless necessary; if you do, explain why in `NOTES.md`.
- Use the existing scripts when relevant: `npm test`, `npm start`, `npm run generate`.
- Do not introduce a build step or rely on TypeScript type-checking at runtime; Node strips types but does not check them.

## TypeScript & module conventions
- Write **erasable TypeScript only** (no `enum`, `namespace`, or constructor parameter properties).
- Use ESM imports with **`.ts` extensions** (e.g. `./foo.ts`) and use `import type` for type-only imports.
- Keep the **exports and function signatures in `src/index.ts`** working/compatible (external tests may run against them).

## Git
- **Do not make any commits.**
