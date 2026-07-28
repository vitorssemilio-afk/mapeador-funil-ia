# Mapeador de Funil IA

## Setup

1. Crie um projeto no [Supabase](https://supabase.com).
2. Rode as migrations em `supabase/migrations/` **em ordem** (0001, depois 0002) no SQL Editor do Supabase, ou `supabase db push` via CLI.
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
- `/formulario/:id` — **rota pública**, sem login. Link que o cliente final recebe pra preencher
  o formulário sozinho, sem ver o funil gerado nem nada relacionado a IA

## Tabelas (Supabase)

- `mapeamentos` — cada preenchimento do formulário de mapeamento
- `funis_gerados` — funis produzidos pela IA a partir de um mapeamento
- `campos_padrao` — biblioteca reutilizável de campos (LEAD/CONTATO)

Todas as tabelas têm RLS habilitado: cada usuário só acessa seus próprios registros.

## Formulário público (`/formulario/:id`)

Permite que o cliente final preencha o formulário sem criar conta, sem ver o funil gerado e sem
qualquer menção a IA — só quem está logado (o time que implanta o CRM) vê os funis.

Implementado com duas funções `SECURITY DEFINER` no Postgres (migration `0002`), em vez de abrir
RLS pro papel `anon`: `public_get_mapeamento(p_id)` e `public_save_respostas(p_id, p_respostas,
p_finalizar)`. Isso evita que alguém sem o link consiga listar ou ler dados de outros clientes —
o acesso é sempre por uma função que exige o `id` exato do mapeamento, nunca uma consulta aberta à
tabela.

O envio é único e definitivo: depois que o cliente clica em "Enviar respostas"
(`p_finalizar = true`), a coluna `enviado_pelo_cliente` vira `true` e novas chamadas de
`public_save_respostas` para aquele `id` são recusadas pela própria função — o link passa a
mostrar só a tela de agradecimento.

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
