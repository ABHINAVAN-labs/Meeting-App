/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  globals: {
    "ts-jest": {
      useESM: true,
      tsconfig: {
        module: "esnext"
      }
    }
  },
  testMatch: ["**/tests/**/*.test.ts"]
};
