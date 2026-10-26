// @vitest-environment node
import Ajv from "ajv";
import cacheRules from "../../infra/cloudflare/cache-rules.json";
import cacheRulesSchema from "../../infra/cloudflare/cache-rules.schema.json";

const validate = new Ajv({ allErrors: true }).compile(cacheRulesSchema);
const optimizerRule = cacheRules.rules.find(
  (rule) => rule.description === "[managed] Cache Next.js optimized images (/_next/image)",
);
// General Cache Rules Vary is available on Free, unlike extension-based Vary for images.
// Raw Accept preserves Next's format negotiation, including quality values and exclusions.
const optimizerVary = {
  default: { action: "bypass" },
  headers: {
    accept: { action: "passthrough" },
    "accept-encoding": { action: "normalize" },
  },
};

function configWithVary(vary: unknown) {
  if (!optimizerRule) throw new Error("Missing Next image optimizer cache rule");
  return {
    rules: [{ ...optimizerRule, action_parameters: { ...optimizerRule.action_parameters, vary } }],
  };
}

describe("Cloudflare optimizer cache-rule contract", () => {
  it("accepts the general Cache Rules Vary API object before deployment", () => {
    expect(validate(configWithVary(optimizerVary))).toBe(true);
  });

  it("deploys raw Accept separation without replacing the native query cache key", () => {
    expect(validate(cacheRules)).toBe(true);
    expect(optimizerRule?.action_parameters).toMatchObject({ cache: true, vary: optimizerVary });
    expect(optimizerRule?.action_parameters).not.toHaveProperty("cache_key");
  });

  it.each([
    {},
    { default: {} },
    { default: { action: "ignore" } },
    { default: { action: "bypass", unexpected: true } },
    { ...optimizerVary, headers: { Accept: { action: "passthrough" } } },
    { ...optimizerVary, headers: { accept: { action: "ignore" } } },
  ])("rejects malformed Vary API settings: %j", (vary) => {
    expect(validate(configWithVary(vary))).toBe(false);
  });
});
