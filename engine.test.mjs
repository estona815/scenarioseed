import test from "node:test";
import assert from "node:assert/strict";
import { checkSchema, generate, presets, validate } from "./engine.mjs";

test("presets produce one valid baseline and specific invalid boundary cases", () => {
  for (const schema of Object.values(presets)) {
    const cases = generate(schema);
    assert.equal(cases[0].expected, "Pass");
    assert.ok(cases.some(item => item.name.startsWith("Missing ") && item.expected === "Fail"));
    assert.ok(cases.some(item => item.name.startsWith("Wrong type:") && item.expected === "Fail"));
    for (const item of cases) assert.equal(validate(schema, item.payload).length === 0, item.expected === "Pass", item.name);
  }
});

test("nested required field and numeric bounds identify the actual defect", () => {
  const cases = generate(presets.order);
  const missing = cases.find(item => item.name === "Missing items[0].productId");
  const below = cases.find(item => item.name === "Below minimum: items[0].quantity");
  assert.deepEqual(missing.errors, ["root.items[0].productId: required"]);
  assert.deepEqual(below.errors, ["root.items[0].quantity: below 1"]);
});

test("zero-size arrays and low maxima keep the baseline valid", () => {
  const schema = { type: "object", required: ["items", "count"], properties: { items: { type: "array", maxItems: 0, items: { type: "string" } }, count: { type: "integer", maximum: 0 } } };
  const cases = generate(schema);
  assert.equal(cases[0].expected, "Pass");
  assert.deepEqual(cases[0].payload, { items: [], count: 0 });
});

test("malformed and unsafe schema shapes are rejected", () => {
  assert.throws(() => checkSchema({ type: "object", properties: { x: { type: "string", minLength: 3, maxLength: 1 } } }), /exceeds/);
  assert.throws(() => checkSchema({ type: "object", properties: { x: { type: "integer", minimum: 1.1, maximum: 1.2 } } }), /no valid value/);
  assert.throws(() => checkSchema({ type: "object", properties: { x: { type: "array", items: { type: "string" }, maxItems: 100000 } } }), /prototype limits/);
  assert.throws(() => checkSchema({ type: "object", properties: { x: { type: "string", minLength: 1.5 } } }), /must be an integer/);
  assert.throws(() => checkSchema({ type: "object", properties: { x: { type: "string", minLength: 3, enum: ["a", "bb"] } } }), /valid baseline/);
});

test("an enum baseline uses a value that satisfies its length bounds", () => {
  const schema = { type: "object", required: ["code"], properties: { code: { type: "string", minLength: 3, enum: ["no", "yes"] } } };
  const cases = generate(schema);
  assert.deepEqual(cases[0].payload, { code: "yes" });
  assert.equal(cases[0].expected, "Pass");
});

const fieldSchema = field => ({ type: "object", required: ["x"], properties: { x: field } });

test("nonfinite enum values cannot silently change to null during JSON export", () => {
  const overflow = JSON.parse('{"type":"object","properties":{"x":{"type":"number","enum":[1e400]}}}');
  assert.throws(() => generate(overflow), /JSON-safe/);
  assert.ok(validate({ type: "number" }, Infinity).length);
  for (const item of generate(presets.order)) {
    const exported = JSON.parse(JSON.stringify(item.payload));
    assert.deepEqual(exported, item.payload);
    assert.equal(validate(presets.order, exported).length === 0, item.expected === "Pass");
  }
});

test("enum probes remain outside choices without changing primitive type", () => {
  for (const field of [{ type: "string", enum: ["not-an-option"] }, { type: "integer", enum: [1, 2] }]) {
    const item = generate(fieldSchema(field)).find(x => x.name === "Outside choices: x");
    assert.equal(typeof item.payload.x, field.type === "integer" ? "number" : "string");
    assert.deepEqual(item.errors, ["root.x: value is outside enum"]);
  }
  assert.equal(generate(fieldSchema({ type: "boolean", enum: [false, true] })).some(x => x.name === "Outside choices: x"), false);
});

test("object and array enums use JSON structural identity, including after export", () => {
  const fields = [
    { type: "object", properties: { n: { type: "integer" } }, enum: [{ n: 1 }] },
    { type: "array", items: { type: "integer" }, enum: [[1, 2]] },
    { type: "object", properties: { optional: { type: "object", properties: { n: { type: "integer" } } } }, enum: [{}] }
  ];
  for (const field of fields) {
    const schema = fieldSchema(field), items = generate(schema);
    assert.equal(items[0].expected, "Pass");
    for (const item of items) assert.equal(validate(schema, JSON.parse(JSON.stringify(item.payload))).length === 0, item.expected === "Pass");
    assert.equal(items.find(x => x.name === "Outside choices: x").expected, "Fail");
  }
});

test("numeric baselines and mutations handle fractional, negative and large bounds", () => {
  assert.equal(generate(fieldSchema({ type: "integer", maximum: 0.2 }))[0].payload.x, 0);
  assert.equal(generate(fieldSchema({ type: "integer", minimum: -4, maximum: -2 }))[0].expected, "Pass");
  for (const field of [{ type: "integer", minimum: 0.2, maximum: 2.8 }, { type: "number", minimum: 1e308, maximum: 1e308 }]) {
    for (const item of generate(fieldSchema(field)).filter(x => /Below minimum|Above maximum/.test(x.name))) {
      assert.equal(Number.isFinite(item.payload.x), true);
      assert.equal(item.expected, "Fail");
      if (field.type === "integer") assert.equal(Number.isInteger(item.payload.x), true);
    }
  }
});

test("malformed enum and required keywords are rejected as schema errors", () => {
  for (const value of [null, false, 0, [], "x"]) assert.throws(() => checkSchema(fieldSchema({ type: "string", enum: value })), /enum/);
  for (const value of [null, false, 0, [1], ["x", "x"]]) assert.throws(() => checkSchema({ ...fieldSchema({ type: "string" }), required: value }), /required/);
});

test("Unicode lengths count code points, not UTF-16 units", () => {
  assert.deepEqual(validate({ type: "string", maxLength: 1 }, "😀"), []);
  assert.equal(validate({ type: "string", maxLength: 1 }, "😀a").length, 1);
  assert.equal(validate({ type: "string", minLength: 2 }, "😀").length, 1);
});
