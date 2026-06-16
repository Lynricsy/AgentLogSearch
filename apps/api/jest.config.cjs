module.exports = {
  clearMocks: true,
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["js", "json", "ts"],
  preset: "ts-jest/presets/default-esm",
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^\\./app\\.module\\.js$": "<rootDir>/src/app.module.ts",
    "^\\./bootstrap\\.js$": "<rootDir>/src/bootstrap.ts",
    "^\\./health\\.controller\\.js$": "<rootDir>/src/health.controller.ts",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
        useESM: true,
      },
    ],
  },
}
