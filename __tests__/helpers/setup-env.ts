// Runs before every suite (jest.config.js → setupFiles).

// Keep brute-force lockout in memory: suites mock Supabase per test, and the
// shared store (lib/auth-lockout.ts) has its own suite that opts back in.
process.env.AUTH_LOCKOUT_STORE = "memory"
