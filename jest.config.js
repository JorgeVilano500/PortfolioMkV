/**
 * Jest config — Babel transform (no babel.config.js at the root on purpose:
 * a root babel config would switch Next.js itself off SWC and slow builds).
 *
 * Suites run in Node by default. Component suites (*.test.tsx) opt into a DOM
 * with a `/** @jest-environment jsdom *\/` docblock at the top of the file.
 */

/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
    },
    clearMocks: true,
    transform: {
        "^.+\\.(t|j)sx?$": [
            "babel-jest",
            {
                presets: [
                    ["@babel/preset-env", { targets: { node: "current" } }],
                    ["@babel/preset-react", { runtime: "automatic" }],
                    "@babel/preset-typescript",
                ],
            },
        ],
    },
}
