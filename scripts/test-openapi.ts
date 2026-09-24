// Sem imports: o export vazio mantém o arquivo como módulo, para que url, key
// e fetchSchema não virem globais e colidam com outros scripts no tsc.
export {};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchSchema() {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key! }
  });
  const json = await res.json();
  console.log("Schemas available:", Object.keys(json.definitions || json.components?.schemas || {}));
  const schema = json.definitions?.pacientes || json.components?.schemas?.pacientes;
  console.log("Pacientes properties:", schema ? Object.keys(schema.properties) : "Not found");
}

fetchSchema();
