import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function test() {
  // Só abre a sessão para a consulta abaixo passar pela RLS; o retorno não é usado.
  // Credenciais pelo ambiente: uma senha escrita aqui fica para sempre no
  // histórico do git (já aconteceu uma vez neste arquivo).
  const email = process.env.TESTE_EMAIL;
  const password = process.env.TESTE_SENHA;
  if (!email || !password) {
    console.error("Defina TESTE_EMAIL e TESTE_SENHA (conta de teste, nunca a de uma psicóloga real).");
    process.exit(1);
  }
  await supabase.auth.signInWithPassword({ email, password });
  
  const { data, error } = await supabase
    .from('pacientes')
    .select('*')
    .limit(1);

  console.log("Keys:", data?.[0] ? Object.keys(data[0]) : "No data", error);
}
test();
