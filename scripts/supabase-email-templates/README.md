# 📧 Como Configurar os Templates de E-mail no Supabase Auth

Os templates de e-mail do **PsiSetting** foram criados em HTML responsivo com a logo oficial, cores institucionais (Verde Oliva `#5C6753` e Fundo Linho `#FAF6F0`) e mensagens acolhedoras em português.

---

## 🛠️ Passo a Passo para Configurar no Supabase (Leva 2 minutos):

1. Acesse o painel do seu projeto no **[Supabase](https://supabase.com/dashboard)**.
2. No menu lateral esquerdo, clique em **Authentication** e depois em **Email Templates**.

---

### 1. Template: Confirmação de Cadastro (`Confirm signup`)
* Clique na aba **"Confirm signup"**.
* No campo **Subject (Assunto)**, coloque:  
  `Bem-vinda ao PsiSetting! Confirme seu e-mail`
* No campo **Body (HTML)**:
  * Apague o conteúdo padrão em inglês.
  * Abra o arquivo [`confirm-signup.html`](./confirm-signup.html), copie todo o conteúdo e cole no campo.
* Clique em **Save changes**.

---

### 2. Template: Redefinição de Senha (`Reset password`)
* Clique na aba **"Reset password"**.
* No campo **Subject (Assunto)**, coloque:  
  `Redefinição de senha — PsiSetting`
* No campo **Body (HTML)**:
  * Apague o conteúdo padrão.
  * Abra o arquivo [`reset-password.html`](./reset-password.html), copie todo o conteúdo e cole no campo.
* Clique em **Save changes**.
