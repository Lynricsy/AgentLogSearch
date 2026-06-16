module.exports = {
  clearMocks: true,
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["js", "json", "ts"],
  preset: "ts-jest/presets/default-esm",
  rootDir: "..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/**/*.e2e-spec.ts"],
  moduleNameMapper: {
    "^\\./app\\.module\\.js$": "<rootDir>/src/app.module.ts",
    "^\\./bootstrap\\.js$": "<rootDir>/src/bootstrap.ts",
    "^\\./database-url\\.js$": "<rootDir>/src/database/database-url.ts",
    "^\\./database/(.*)\\.js$": "<rootDir>/src/database/$1.ts",
    "^\\./health\\.controller\\.js$": "<rootDir>/src/health.controller.ts",
    "^\\./pg\\.service\\.js$": "<rootDir>/src/database/pg.service.ts",
    "^\\./prisma\\.service\\.js$": "<rootDir>/src/database/prisma.service.ts",
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
