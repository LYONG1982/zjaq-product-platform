const actions = ["plan", "initialize", "seed-originals", "backup", "restore", "migrate-public-ids"] as const;
type Action = typeof actions[number];
/** Parse before constructing any cloud client; reject ambiguous maintenance commands. */
export function parseCloudOperationArguments(args: string[]) {
  const action = (args[0] ?? "plan") as Action;
  if (!(actions as readonly string[]).includes(action)) throw new Error("Unknown action");
  const extra: Record<Action, string[]> = {
    plan: [], initialize: ["--create-collections"], "seed-originals": [], backup: ["--file"], restore: ["--file", "--isolated-target"], "migrate-public-ids": ["--file", "--backup"],
  };
  const values = new Map<string, string>(), flags = new Set<string>(), allowed = new Set(["--apply", "--environment", ...extra[action]]);
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag) || flags.has(flag)) throw new Error("Unknown or repeated argument: " + flag);
    flags.add(flag);
    if (["--environment", "--file", "--backup"].includes(flag)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("Missing value for " + flag);
      values.set(flag, value);
    }
  }
  const apply = flags.has("--apply");
  if (apply) {
    if (action === "plan") throw new Error("Plan does not accept --apply");
    const required = ["--environment", ...(["backup", "restore", "migrate-public-ids"].includes(action) ? ["--file"] : []), ...(action === "migrate-public-ids" ? ["--backup"] : [])];
    for (const flag of required) if (!values.has(flag)) throw new Error("Explicit argument required: " + flag);
    if (action === "restore" && !flags.has("--isolated-target")) throw new Error("Restore requires --isolated-target");
  }
  return { action, apply, value(flag: string) { const value = values.get(flag); if (!value) throw new Error("Explicit argument required: " + flag); return value; } };
}

export function parseOfflinePublicIdArguments(args: string[]) {
  const usage = "用法：node --import tsx scripts/public-id-migration.ts --backup 私有备份.json --output 私有迁移计划.json";
  if (args.length !== 4) throw new Error(usage);
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!["--backup", "--output"].includes(flag) || values.has(flag) || !value || value.startsWith("--")) throw new Error(usage);
    values.set(flag, value);
  }
  const backupPath = values.get("--backup"), output = values.get("--output");
  if (!backupPath || !output) throw new Error(usage);
  return { backupPath, output };
}
