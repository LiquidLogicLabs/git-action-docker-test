import { parseBoolean, parseJsonArray, parseJsonObject, parseNumber } from "../src/lib/inputs";

describe("inputs parsing", () => {
  describe("parseJsonArray", () => {
    it("parses valid JSON array", () => {
      expect(parseJsonArray('["A","B"]', "errorPatterns")).toEqual(["A", "B"]);
    });

    it("throws on invalid JSON", () => {
      expect(() => parseJsonArray("{", "errorPatterns")).toThrow(/errorPatterns/);
    });
  });

  describe("parseJsonObject", () => {
    it("parses valid JSON object", () => {
      expect(parseJsonObject('{"A":"1"}', "minimalEnv")).toEqual({ A: "1" });
    });

    it("throws on invalid JSON", () => {
      expect(() => parseJsonObject("{", "minimalEnv")).toThrow(/minimalEnv/);
    });
  });

  describe("parseNumber", () => {
    it("returns fallback when empty", () => {
      expect(parseNumber("", 5, "timeout")).toBe(5);
    });

    it("throws when invalid", () => {
      expect(() => parseNumber("abc", 5, "timeout")).toThrow(/timeout/);
    });
  });

  describe("parseBoolean", () => {
    it("parses true/false values", () => {
      expect(parseBoolean("true", false)).toBe(true);
      expect(parseBoolean("false", true)).toBe(false);
    });

    it("throws when invalid", () => {
      expect(() => parseBoolean("yes", false, "verbose")).toThrow(/verbose/);
    });
  });
});
