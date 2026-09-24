import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function test() {
  // Credenciais pelo ambiente: uma senha escrita aqui fica para sempre no
  // histórico do git (já aconteceu uma vez nestes scripts).
  const email = process.env.TESTE_EMAIL;
  const password = process.env.TESTE_SENHA;
  if (!email || !password) {
    console.error("Defina TESTE_EMAIL e TESTE_SENHA (conta de teste, nunca a de uma psicóloga real).");
    process.exit(1);
  }
  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({ email, password });

  if (authError) {
    console.log("Auth Error:", authError);
    return;
  }

  console.log("Logged in user:", user?.id);

  const { data, error } = await supabase
    .from('pacientes')
    .insert({
      nome: 'Teste Paciente',
      psicologo_id: user?.id,
      cpf: null,
      telefone: '11111111111'
    })
    .select();

  console.log("Insert result:", { data, error });
}

test();
