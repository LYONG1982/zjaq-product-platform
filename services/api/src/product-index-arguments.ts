/** Strict local parsing occurs before reading backup files or constructing cloud clients. */
export function parseProductIndexArguments(args: string[]) {
  const values = new Map<string,string>(),seen = new Set<string>();
  const flags = new Set(["--apply","--file","--out","--plan","--environment"]);
  for(let index=0;index<args.length;index++){
    const flag=args[index];if(!flags.has(flag)||seen.has(flag))throw new Error("Unknown or repeated argument: "+flag);seen.add(flag);
    if(flag!=="--apply"){
      const value=args[++index];if(!value?.trim()||value.startsWith("--"))throw new Error("Missing value for "+flag);values.set(flag,value);
    }
  }
  if(!args.length)return {help:true,apply:false,file:undefined,output:undefined,plan:undefined,environment:undefined};
  const apply=seen.has("--apply");
  const required=apply?["--file","--plan","--environment"]:["--file","--out"];
  for(const flag of required)if(!values.has(flag))throw new Error("Explicit argument required: "+flag);
  if(apply&&values.has("--out"))throw new Error("Apply does not accept --out");
  if(!apply&&(values.has("--plan")||values.has("--environment")))throw new Error("Offline planning does not accept --plan or --environment");
  return {help:false,apply,file:values.get("--file"),output:values.get("--out"),plan:values.get("--plan"),environment:values.get("--environment")};
}
