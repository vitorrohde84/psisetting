import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function test() {
  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'hellen@psicologa.com',
    password: 'hell327589'
  });

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
