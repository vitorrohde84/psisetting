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
  
  const { data, error } = await supabase
    .from('pacientes')
    .select('*')
    .limit(1);

  console.log("Keys:", data?.[0] ? Object.keys(data[0]) : "No data", error);
}
test();
