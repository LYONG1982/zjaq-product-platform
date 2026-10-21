import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { compile, type JSONSchema } from "json-schema-to-typescript";
const root = resolve(import.meta.dirname, "..");
const check = process.argv.includes("--check");
async function output(path: string, content: string) {
  const full = resolve(root, path);
  if (check) {
    if ((await readFile(full, "utf8")) !== content)
      throw new Error("Generated file differs: " + path);
  } else {
    await mkdir(resolve(full, ".."), { recursive: true });
    await writeFile(full, content);
  }
}
for (const [name, file] of [
  ["Domain", "domain"],
  ["Responses", "response"],
]) {
  const raw = JSON.parse(
    await readFile(resolve(root, "contracts", file + ".schema.json"), "utf8"),
  );
  const schema = {
    ...raw,
    title: name,
    type: "object",
    properties: Object.fromEntries(
      Object.keys(raw.$defs).map((k) => [k, { $ref: "#/$defs/" + k }]),
    ),
    required: Object.keys(raw.$defs),
    additionalProperties: false,
  };
  const content = await compile(schema as JSONSchema, name, {
    cwd: resolve(root, "contracts") + "/",
    bannerComment:
      "/* Generated from contracts. Run pnpm generate; do not edit manually. */",
    unreachableDefinitions: true,
    // Editable collections use arrays; Ajv retains all runtime minItems/maxItems limits.
    ignoreMinAndMaxItems: true,
    additionalProperties: false,
    style: { singleQuote: true },
  });
  await output(
    "packages/contracts/src/" +
      (file === "domain" ? "domain" : "responses") +
      ".generated.d.ts",
    content,
  );
}
const tokens = JSON.parse(
  await readFile(resolve(root, "design/tokens.json"), "utf8"),
);
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
const lines: string[] = [];
for (const [group, values] of Object.entries(tokens))
  if (["color", "spacing", "radius"].includes(group))
    for (const [key, value] of Object.entries(
      values as Record<string, unknown>,
    ))
      lines.push(
        "  --zj-" +
          group +
          "-" +
          kebab(key) +
          ": " +
          value +
          (group === "color" ? "" : "px") +
          ";",
      );
for (const [key, value] of Object.entries(tokens.font.size))
  lines.push("  --zj-font-size-" + kebab(key) + ": " + value + "px;");
for (const [key, value] of Object.entries(tokens.layout))
  lines.push("  --zj-layout-" + kebab(key) + ": " + value + "px;");
lines.push(
  "  --zj-font-family: " + tokens.font.family + ";",
  "  --zj-line-height: " + tokens.font.lineHeight + ";",
);
await output(
  "packages/design-tokens/tokens.css",
  ":root {\\n".replace("\\n", "\n") + lines.join("\n") + "\n}\n",
);
await output(
  "packages/design-tokens/mobile.css",
  "page {\n" + lines.join("\n") + "\n}\n",
);
const scss =
  Object.entries(tokens.color)
    .map(([k, v]) => "$zj-color-" + kebab(k) + ": " + v + ";")
    .join("\n") + "\n";
await output("packages/design-tokens/tokens.scss", scss);
console.log(
  check
    ? "Generated contracts and tokens match."
    : "Generated contracts and tokens.",
);
