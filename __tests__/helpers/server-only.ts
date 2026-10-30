// Jest stand-in for the `server-only` package. Next.js resolves that import
// itself (a build error in Client Components, a no-op on the server); plain
// Node has no such module, so jest.config.js maps it here.
export {}
