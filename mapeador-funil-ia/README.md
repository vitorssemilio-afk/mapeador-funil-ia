# Mapeador de Funil IA

Fase 1 — fundação do app: schema Supabase, autenticação e estrutura de rotas.

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
- `/mapeamento/:id` — respostas do mapeamento + funil gerado pela IA

## Tabelas (Supabase)

- `mapeamentos` — cada preenchimento do formulário de mapeamento
- `funis_gerados` — funis produzidos pela IA a partir de um mapeamento
- `campos_padrao` — biblioteca reutilizável de campos (LEAD/CONTATO)

Todas as tabelas têm RLS habilitado: cada usuário só acessa seus próprios registros.
