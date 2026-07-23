# Mapeador de Funil IA

## Setup

1. Crie um projeto no [Supabase](https://supabase.com).
2. Rode a migration em `supabase/migrations/0001_init.sql` (SQL Editor do Supabase ou `supabase db push` via CLI).
3. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key do seu projeto.
4. Ative Email/Password em Authentication → Providers no painel do Supabase.

```bash
npm install
npm run dev
```

## Estrutura

- `/login` — autenticação (login/cadastro)
- `/` — dashboard com lista de mapeamentos
- `/novo` — criação de um novo mapeamento
- `/mapeamento/:id` — wizard de mapeamento (rascunho), status de processamento ou funis gerados

## Tabelas (Supabase)

- `mapeamentos` — cada preenchimento do formulário de mapeamento
- `funis_gerados` — funis produzidos pela IA a partir de um mapeamento
- `campos_padrao` — biblioteca reutilizável de campos (LEAD/CONTATO)

Todas as tabelas têm RLS habilitado: cada usuário só acessa seus próprios registros.

## Edge Function `gerar-funil`

Recebe `mapeamento_id`, monta as respostas em texto, chama a Groq API (endpoint compatível com
OpenAI) e grava os funis gerados em `funis_gerados`, atualizando `mapeamentos.status` para
`concluido` ou `erro`.

Gere uma chave gratuita em [console.groq.com](https://console.groq.com) → **API Keys** (não exige
cartão).

Deploy e configuração via [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy gerar-funil
supabase secrets set GROQ_API_KEY=gsk_...
# opcional — sobrescreve o modelo padrão (openai/gpt-oss-120b)
supabase secrets set GROQ_MODEL=openai/gpt-oss-120b
```

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já ficam disponíveis automaticamente no runtime da função.
A função usa o JWT do usuário autenticado (repassado pelo front via `supabase.functions.invoke`)
para ler/gravar os dados, então o RLS garante que cada usuário só gera funil para os próprios
mapeamentos.
