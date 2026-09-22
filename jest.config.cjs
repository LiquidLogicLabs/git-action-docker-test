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
      statements: 90,
      branches: 66,
      functions: 82,
      lines: 91
    }
  }
};
