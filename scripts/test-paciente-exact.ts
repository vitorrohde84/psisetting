import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function test() {
  const { data: { user } } = await supabase.auth.signInWithPassword({
    email: 'hellen@psicologa.com',
    password: 'hell327589'
  });

  const payload = {
      nome: "Vitor 2",
      cpf: null,
      data_nascimento: null,
      telefone: "11111111111",
      email: "111@gmail.com",
      endereco: "11111111111",
      contato_emergencia: "111111111",
      observacoes_gerais: "11111111",
      ativo: true,
      psicologo_id: user?.id,
  };

  const { data, error } = await supabase
    .from('pacientes')
    .insert(payload)
    .select();

  console.log("Insert result:", { data, error });
}
test();
