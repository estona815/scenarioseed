// ScenarioSeed: a small, deterministic JSON Schema test-case generator.
// Supported keywords are listed in README.md. No network or personal data is used.

export const presets = {
  order: {
    title: "Order API",
    type: "object",
    required: ["customerId", "items"],
    properties: {
      customerId: { type: "string", minLength: 3, maxLength: 16 },
      items: {
        type: "array", minItems: 1, maxItems: 4,
        items: {
          type: "object", required: ["productId", "quantity"],
          properties: {
            productId: { type: "string", minLength: 3, maxLength: 12 },
            quantity: { type: "integer", minimum: 1, maximum: 1000 },
            giftWrap: { type: "boolean" }
          }
        }
      },
      priority: { type: "string", enum: ["standard", "express"] }
    }
  },
  inventory: {
    title: "Inventory API",
    type: "object",
    required: ["sku", "onHand"],
    properties: {
      sku: { type: "string", minLength: 4, maxLength: 12 },
      onHand: { type: "integer", minimum: 0, maximum: 9999 },
      reorder: { type: "boolean" },
      zone: { type: "string", enum: ["north", "south", "east"] }
    }
  }
};

const clone = value => structuredClone(value);
const label = path => path.map(part => typeof part === "number" ? `[${part}]` : part).join(".").replace(/\.\[/g, "[");

const valueType = value => Array.isArray(value) ? "array" : value === null ? "null" : Number.isInteger(value) ? "integer" : typeof value;
const isJsonValue = (value, depth = 0) => {
  if (depth > 8) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value !== "object") return false;
  return Object.values(value).every(child => isJsonValue(child, depth + 1));
};
const equalJson = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equalJson(left[key], right[key]));
};

function outsideEnum(node) {
  const values = node.enum;
  let candidate;
  for (let i = 0; i <= values.length; i++) {
    switch (node.type) {
      case "string": candidate = `not-an-option${i ? `-${i}` : ""}`; break;
      case "integer": case "number": candidate = i; break;
      case "boolean":
        candidate = [false, true].find(value => !values.some(item => equalJson(item, value)));
        return candidate;
      case "object": candidate = { ...sample(node), [`scenarioseedOutside${i}`]: true }; break;
      case "array": candidate = Array.from({ length: i }, () => sample(node.items)); break;
    }
    if (!values.some(value => equalJson(value, candidate))) return candidate;
  }
}

export function checkSchema(schema) {
  if (!schema || schema.type !== "object" || !schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) {
    throw new Error("The root must be an object schema with properties.");
  }
  const walk = (node, depth = 0) => {
    if (depth > 4) throw new Error("Schemas may be nested at most four levels.");
    if (!node || !["object", "array", "string", "integer", "number", "boolean"].includes(node.type)) {
      throw new Error("Each field needs a supported type.");
    }
    if (node.type === "object") {
      if (!node.properties || typeof node.properties !== "object" || Array.isArray(node.properties)) throw new Error("Object fields need properties.");
      for (const [name, child] of Object.entries(node.properties)) {
        if (!name || name === "__proto__" || name === "constructor") throw new Error("Unsafe or empty property name.");
        walk(child, depth + 1);
      }
      if (node.required !== undefined && (!Array.isArray(node.required) || node.required.some(x => typeof x !== "string" || !Object.hasOwn(node.properties, x)) || new Set(node.required).size !== node.required.length)) throw new Error("required must list unique existing properties.");
    }
    if (node.type === "array") {
      if (!node.items) throw new Error("Array fields need items.");
      walk(node.items, depth + 1);
    }
    for (const [a, b] of [["minLength", "maxLength"], ["minimum", "maximum"], ["minItems", "maxItems"]]) {
      const nonnegative = a !== "minimum";
      if (node[a] !== undefined && (!Number.isFinite(node[a]) || (nonnegative && node[a] < 0))) throw new Error(`${a} must be a ${nonnegative ? "nonnegative " : "finite "}number.`);
      if (node[b] !== undefined && (!Number.isFinite(node[b]) || (nonnegative && node[b] < 0))) throw new Error(`${b} must be a ${nonnegative ? "nonnegative " : "finite "}number.`);
      if (node[a] !== undefined && node[b] !== undefined && node[a] > node[b]) throw new Error(`${a} exceeds ${b}.`);
    }
    for (const key of ["minLength", "maxLength", "minItems", "maxItems"]) {
      if (node[key] !== undefined && !Number.isInteger(node[key])) throw new Error(`${key} must be an integer.`);
    }
    if ((node.minLength ?? 0) > 200 || (node.maxLength ?? 0) > 200 || (node.minItems ?? 0) > 25 || (node.maxItems ?? 0) > 25) throw new Error("Length and item bounds exceed prototype limits.");
    if (node.type === "integer" && node.minimum !== undefined && node.maximum !== undefined && Math.ceil(node.minimum) > Math.floor(node.maximum)) throw new Error("Integer range has no valid value.");
    if (node.enum !== undefined && (!Array.isArray(node.enum) || !node.enum.length || node.enum.some(x => !isJsonValue(x) || nodeTypeMismatch(node.type, valueType(x))))) throw new Error("enum must contain JSON-safe values matching the field type.");
  };
  walk(schema);
  if (validate(schema, sample(schema)).length) throw new Error("The schema cannot produce a valid baseline with the supported rules.");
  return schema;
}

function sample(node) {
  if (node.enum !== undefined) return clone(node.enum.find(value => validate({ ...node, enum: undefined }, value).length === 0));
  switch (node.type) {
    case "object": return Object.fromEntries(Object.entries(node.properties).map(([key, child]) => [key, sample(child)]));
    case "array": return Array.from({ length: node.maxItems === 0 ? 0 : Math.max(1, node.minItems ?? 0) }, () => sample(node.items));
    case "string": return "x".repeat(Math.max(3, node.minLength ?? 0)).slice(0, node.maxLength ?? Infinity);
    case "integer": return Math.max(Math.ceil(node.minimum ?? -Infinity), Math.min(1, Math.floor(node.maximum ?? Infinity)));
    case "number": return node.maximum !== undefined && node.maximum < 1 ? node.maximum : Math.max(1, node.minimum ?? 0);
    case "boolean": return true;
  }
}

export function validate(schema, value, path = "root") {
  const errors = [];
  const fail = message => errors.push(`${path}: ${message}`);
  const type = valueType(value);
  if (nodeTypeMismatch(schema.type, type)) return [`${path}: expected ${schema.type}, got ${type}`];
  if ((schema.type === "integer" || schema.type === "number") && !Number.isFinite(value)) return [`${path}: expected a finite JSON number`];
  if (schema.enum !== undefined && !schema.enum.some(item => equalJson(item, value))) fail("value is outside enum");
  if (schema.type === "string") {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) fail(`length below ${schema.minLength}`);
    if (schema.maxLength !== undefined && length > schema.maxLength) fail(`length above ${schema.maxLength}`);
  }
  if (schema.type === "integer" || schema.type === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) fail(`below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(`above ${schema.maximum}`);
  }
  if (schema.type === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail(`fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(`more than ${schema.maxItems} items`);
    value.forEach((item, i) => errors.push(...validate(schema.items, item, `${path}[${i}]`)));
  }
  if (schema.type === "object") {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key}: required`);
    for (const [key, child] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) errors.push(...validate(child, value[key], `${path}.${key}`));
    }
  }
  return errors;
}

function nodeTypeMismatch(expected, actual) {
  if (expected === "number") return actual !== "integer" && actual !== "number";
  return expected !== actual;
}

function mutate(base, path, value, remove = false) {
  if (!path.length) return clone(value);
  const next = clone(base);
  let cursor = next;
  for (const part of path.slice(0, -1)) cursor = cursor[part];
  if (remove) delete cursor[path.at(-1)]; else cursor[path.at(-1)] = value;
  return next;
}

export function generate(schema) {
  checkSchema(schema);
  const base = sample(schema);
  const cases = [];
  const add = (name, rule, payload) => {
    const errors = validate(schema, payload);
    cases.push({ id: cases.length + 1, name, rule, expected: errors.length ? "Fail" : "Pass", payload, errors });
  };
  add("Valid baseline", "All required fields", base);
  const visit = (node, path = []) => {
    if (node.enum !== undefined) {
      const outside = outsideEnum(node);
      if (outside !== undefined) add(`Outside choices: ${label(path) || "root"}`, `${label(path) || "root"} · enum`, mutate(base, path, outside));
    }
    if (node.type === "object") {
      for (const [key, child] of Object.entries(node.properties)) {
        const childPath = [...path, key];
        if ((node.required ?? []).includes(key)) add(`Missing ${label(childPath)}`, `${label(childPath)} · required`, mutate(base, childPath, undefined, true));
        else add(`Omit ${label(childPath)}`, `${label(childPath)} · optional`, mutate(base, childPath, undefined, true));
        if (baseAt(base, path) && Object.hasOwn(baseAt(base, path), key)) visit(child, childPath);
      }
      return;
    }
    if (node.type === "array") {
      if (node.minItems > 0) add(`Empty ${label(path)}`, `${label(path)} · minItems ${node.minItems}`, mutate(base, path, []));
      if (node.maxItems !== undefined && node.maxItems < 25) add(`Too many ${label(path)}`, `${label(path)} · maxItems ${node.maxItems}`, mutate(base, path, Array.from({ length: node.maxItems + 1 }, () => sample(node.items))));
      if (baseAt(base, path).length) visit(node.items, [...path, 0]);
    } else {
      const wrong = node.type === "string" ? 7 : "wrong type";
      add(`Wrong type: ${label(path)}`, `${label(path)} · type ${node.type}`, mutate(base, path, wrong));
      if (node.type === "string") {
        if (node.minLength > 0) add(`Too short: ${label(path)}`, `${label(path)} · minLength ${node.minLength}`, mutate(base, path, "x".repeat(node.minLength - 1)));
        if (node.maxLength !== undefined && node.maxLength < 500) add(`Too long: ${label(path)}`, `${label(path)} · maxLength ${node.maxLength}`, mutate(base, path, "x".repeat(node.maxLength + 1)));
      }
      if (node.type === "integer" || node.type === "number") {
        const lowerStep = Math.max(1, Math.abs(node.minimum) * Number.EPSILON * 2);
        const upperStep = Math.max(1, Math.abs(node.maximum) * Number.EPSILON * 2);
        const below = node.type === "integer" ? Math.ceil(node.minimum) - Math.ceil(lowerStep) : node.minimum - lowerStep;
        const above = node.type === "integer" ? Math.floor(node.maximum) + Math.ceil(upperStep) : node.maximum + upperStep;
        if (node.minimum !== undefined && Number.isFinite(below) && below < node.minimum) add(`Below minimum: ${label(path)}`, `${label(path)} · minimum ${node.minimum}`, mutate(base, path, below));
        if (node.maximum !== undefined && Number.isFinite(above) && above > node.maximum) add(`Above maximum: ${label(path)}`, `${label(path)} · maximum ${node.maximum}`, mutate(base, path, above));
      }
    }
  };
  visit(schema);
  return cases;
}

function baseAt(value, path) {
  return path.reduce((current, part) => current[part], value);
}
