module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/types.ts"
  ],
  coverageThreshold: {
    global: {
      statements: 89,
      branches: 65,
      functions: 81,
      lines: 90
    }
  }
};
