import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// Load env
const env = fs.readFileSync(".env.local", "utf-8");
const vars: any = {};
env.split("\n").forEach(line => {
  const [k, v] = line.split("=");
  if (k && v) vars[k.trim()] = v.trim();
});

const supabase = createClient(vars["NEXT_PUBLIC_SUPABASE_URL"], vars["SUPABASE_SERVICE_ROLE_KEY"]);

async function run() {
  const { data, error } = await supabase.from("diario_bordo").select("*").limit(1);
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
run();
