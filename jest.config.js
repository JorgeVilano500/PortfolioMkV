/**
 * Jest config — Babel transform (no babel.config.js at the root on purpose:
 * a root babel config would switch Next.js itself off SWC and slow builds).
 */

/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: "node",
    testMatch: ["**/__tests__/**/*.test.ts"],
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
                    "@babel/preset-typescript",
                ],
            },
        ],
    },
}
