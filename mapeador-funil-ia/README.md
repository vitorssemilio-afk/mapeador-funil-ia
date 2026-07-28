# Mapeador de Funil IA

## Setup

1. Crie um projeto no [Supabase](https://supabase.com).
2. Rode as migrations em `supabase/migrations/` **em ordem** (0001 até 0005) no SQL Editor do Supabase, ou `supabase db push` via CLI.
3. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key do seu projeto.
4. Ative Email/Password em Authentication → Providers no painel do Supabase.

```bash
npm install
npm run dev
```

## Estrutura

- `/login` — autenticação (login/cadastro)
- `/` — dashboard com cards de estatísticas (aguardando preenchimento, cliente respondeu, gerando
  funil, funil gerado, erro) e lista de mapeamentos, filtrável por card
- `/novo` — criação de um novo mapeamento
- `/mapeamento/:id` — wizard de mapeamento (rascunho), status de processamento ou funis gerados
- `/f/:codigo` — **rota pública**, sem login. Link curto (6 caracteres) que o cliente final recebe
  pra preencher o formulário sozinho, sem ver o funil gerado nem nada relacionado a IA
- `/formulario/:id` — rota pública antiga (por `uuid` em vez do código curto), mantida só por
  compatibilidade com links já enviados antes da migration `0004`
- `/campos-padrao` — tela de admin com a biblioteca de Campos Padrão
- `/formulario` — tela de admin com os blocos e perguntas do formulário (o que o cliente
  responde), com CRUD completo e reordenação

## Tabelas (Supabase)

- `mapeamentos` — cada preenchimento do formulário de mapeamento
- `funis_gerados` — funis produzidos pela IA a partir de um mapeamento
- `campos_padrao` — biblioteca reutilizável de campos (LEAD/CONTATO)
- `blocos_formulario` / `perguntas_formulario` — os blocos e perguntas do formulário que o
  cliente responde (editáveis pela tela `/formulario`, ver seção abaixo)

Todas as tabelas têm RLS habilitado: cada usuário só acessa seus próprios registros. As exceções
são `campos_padrao` (compartilhada entre todos os usuários autenticados) e
`blocos_formulario`/`perguntas_formulario` (leitura liberada até pro papel `anon`, já que o
formulário público em `/f/:codigo` precisa saber quais perguntas mostrar sem estar logado;
escrita continua restrita a quem está autenticado).

`funis_gerados` guarda histórico: cada regeneração cria uma nova `versao` para o mesmo
`mapeamento_id` em vez de sobrescrever as linhas anteriores.

## Formulário público (`/f/:codigo`)

Permite que o cliente final preencha o formulário sem criar conta, sem ver o funil gerado e sem
qualquer menção a IA — só quem está logado (o time que implanta o CRM) vê os funis.

Implementado com funções `SECURITY DEFINER` no Postgres (migrations `0002` e `0004`), em vez de
abrir RLS pro papel `anon`: `public_get_mapeamento(p_id)`, `public_get_mapeamento_by_codigo(p_codigo)`
e `public_save_respostas(p_id, p_respostas, p_finalizar)`. Isso evita que alguém sem o link consiga
listar ou ler dados de outros clientes — o acesso é sempre por uma função que exige o `id` ou
`codigo_curto` exato do mapeamento, nunca uma consulta aberta à tabela.

O envio é único e definitivo: depois que o cliente clica em "Enviar respostas"
(`p_finalizar = true`), a coluna `enviado_pelo_cliente` vira `true` e novas chamadas de
`public_save_respostas` para aquele `id` são recusadas pela própria função — o link passa a
mostrar só a tela de agradecimento.

### Link curto (`codigo_curto`)

O botão "Copiar link para o cliente" (na tela do mapeamento) monta o link com `codigo_curto` —
6 caracteres (`/f/aX7k2Q`), bem mais curto e profissional do que o `uuid` completo do mapeamento.
O código é gerado automaticamente por um trigger `before insert` no Postgres (migration `0004`),
usando um alfabeto sem caracteres ambíguos (sem `0/O`, `1/I/l`), então nenhum código precisa ser
gerado manualmente no front. A rota antiga `/formulario/:id` continua funcionando, então links já
enviados antes dessa mudança não quebram.

## Formulário dinâmico (`/formulario`)

As perguntas do formulário público não vivem mais fixas no código — ficam nas tabelas
`blocos_formulario` e `perguntas_formulario` (migration `0005`, que também faz o seed com os 5
blocos / 24 perguntas que existiam antes em código). A tela `/formulario` permite:

- Criar, renomear, reordenar (↑/↓) e excluir blocos
- Criar, editar, reordenar e excluir perguntas dentro de um bloco (tipo, label, texto de ajuda,
  prefixo pra campos numéricos, se é obrigatória, e as opções pra escolha única/múltipla)

O identificador interno de cada pergunta (`pergunta_id`, a chave usada dentro do `respostas` jsonb
de cada mapeamento) é gerado automaticamente a partir do label na criação e nunca muda depois —
editar o label de uma pergunta já existente não quebra respostas já salvas com aquele
`pergunta_id`.

As opções de escolha única/múltipla são editadas como texto (uma opção por linha), no formato
`valor|Rótulo` — ou só `Rótulo`, e o valor é gerado automaticamente. Pra uma opção ter campo de
texto livre (tipo "Outro, qual?"), acrescenta `|livre:Placeholder` no fim da linha. O formato com
`valor|` explícito existe justamente pra editar uma pergunta sem trocar sem querer o valor
salvo nas respostas já respondidas por clientes anteriores.

O wizard privado (`/mapeamento/:id`), o formulário público (`/f/:codigo`) e a Edge Function
`gerar-funil` (pro texto que vai pro prompt da IA) buscam esse schema do banco em vez de importar
um arquivo fixo — qualquer mudança feita em `/formulario` vale a partir do próximo carregamento,
sem precisar de deploy.

## Campos Padrão (`/campos-padrao`)

Tela de admin (CRUD simples) com a biblioteca de campos "padronizados" (nome, entidade — LEAD ou
CONTATO —, tipo, opções quando for lista/checkbox). Serve só como vocabulário de referência: a
Edge Function `gerar-funil` lê essa tabela antes de chamar a IA e inclui esses nomes no prompt,
pra reduzir variação de nomenclatura entre funis diferentes (ex: sempre "Convênio", nunca
"Plano de saúde" numa geração e "Convênio médico" em outra).

## Histórico de versões e regeneração

Cada vez que a IA gera o funil (seja na primeira geração ou numa regeneração), o resultado é
salvo como uma nova `versao` em `funis_gerados` — a versão anterior nunca é apagada. Na tela do
mapeamento, um seletor de versões aparece quando há mais de uma; versões antigas abrem em modo
somente leitura (os campos da tabela ficam com `readOnly`, sem autosave).

O botão **"Regenerar com instruções extras"** (visível quando o mapeamento já tem pelo menos uma
versão gerada) abre um campo de texto livre — ex: "trate convênio e particular como funis
separados" — e reenvia pra Edge Function via `instrucoes_extras`, que soma esse texto ao prompt
da IA antes de gerar a nova versão.

## Edge Function `gerar-funil`

Recebe `mapeamento_id` (e opcionalmente `instrucoes_extras`), monta as respostas em texto, busca
o vocabulário de `campos_padrao`, chama a Groq API (endpoint compatível com OpenAI) e grava os
funis gerados em `funis_gerados` como uma nova `versao`, atualizando `mapeamentos.status` para
`concluido` ou `erro`.

Gere uma chave gratuita em [console.groq.com](https://console.groq.com) → **API Keys** (não exige
cartão).

Deploy e configuração via [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy gerar-funil
supabase secrets set GROQ_API_KEY=gsk_...
# opcional — sobrescreve o modelo padrão (llama-3.3-70b-versatile)
supabase secrets set GROQ_MODEL=llama-3.3-70b-versatile
```

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já ficam disponíveis automaticamente no runtime da função.
A função usa o JWT do usuário autenticado (repassado pelo front via `supabase.functions.invoke`)
para ler/gravar os dados, então o RLS garante que cada usuário só gera funil para os próprios
mapeamentos.

O `SYSTEM_PROMPT` (`supabase/functions/gerar-funil/prompt.ts`) tem uma regra explícita de quando
separar em mais de um funil (qualificação, vendas, comparecimento, entrega/operação, pós-venda),
apontando pra quais respostas do formulário são o sinal de cada separação — em vez de deixar a
decisão totalmente a critério da IA.
