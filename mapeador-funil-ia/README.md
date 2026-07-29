# Mapeador de Funil IA

## Setup

1. Crie um projeto no [Supabase](https://supabase.com).
2. Rode as migrations em `supabase/migrations/` **em ordem** (0001 até 0007) no SQL Editor do Supabase, ou `supabase db push` via CLI. A migration `0006` usa o [Supabase Vault](https://supabase.com/docs/guides/database/vault) pra criptografia — se o seu projeto não tiver a extensão habilitada, ative em Database → Extensions → `supabase_vault` antes de rodá-la.
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
- `/implementacoes` — lista das implementações de CRM em andamento (POP de 4 semanas)
- `/implementacoes/:id` — detalhe de uma implementação: checklist por semana, dados de acesso e
  credenciais do cliente no CRM
- `/implementacoes/checklist` — tela de admin dos grupos/itens de checklist do POP
- `/mapeamento/:id/relatorio` — relatório em PDF do funil pra apresentar ao cliente (ver seção
  abaixo)

## Tabelas (Supabase)

- `mapeamentos` — cada preenchimento do formulário de mapeamento
- `funis_gerados` — funis produzidos pela IA a partir de um mapeamento
- `campos_padrao` — biblioteca reutilizável de campos (LEAD/CONTATO)
- `blocos_formulario` / `perguntas_formulario` — os blocos e perguntas do formulário que o
  cliente responde (editáveis pela tela `/formulario`, ver seção abaixo)
- `implementacoes_crm` — acompanhamento do POP de implementação de CRM de cada cliente (sempre
  vinculada a um `mapeamento`)
- `checklist_grupos_implementacao` / `checklist_itens_implementacao` — os itens de checklist do
  POP (editáveis pela tela `/implementacoes/checklist`)
- `implementacao_checklist_marcado` — quais itens estão marcados em cada implementação
- `credenciais_crm` — login/senha do cliente no CRM, sempre criptografados (ver seção
  "Implementação de CRM" abaixo)

Todas as tabelas têm RLS habilitado: cada usuário só acessa seus próprios registros. As exceções
são as tabelas pensadas pra serem compartilhadas entre todo o time: `campos_padrao`,
`blocos_formulario`/`perguntas_formulario` (leitura liberada até pro papel `anon`, já que o
formulário público em `/f/:codigo` precisa saber quais perguntas mostrar sem estar logado; escrita
restrita a quem está autenticado), e `implementacoes_crm` /
`checklist_grupos_implementacao`/`checklist_itens_implementacao`/`implementacao_checklist_marcado`
(leitura e escrita liberadas pra qualquer usuário autenticado, pra centralizar o acompanhamento
entre consultores). `credenciais_crm` é a exceção mais estrita: não tem policy de select/insert
/update nenhuma — só dá pra ler/gravar através das funções descritas na seção seguinte.

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

## Implementação de CRM (`/implementacoes`)

Módulo pra centralizar o acompanhamento do POP de implementação de CRM (Kommo Basic/PRO) de cada
cliente — as 4 semanas do processo, do pré-requisito até a entrega final.

- Toda implementação nasce vinculada a um mapeamento já concluído: o botão "Iniciar implementação
  de CRM" aparece na tela do mapeamento (`/mapeamento/:id`) quando o status é `concluido`, e cria
  uma linha em `implementacoes_crm` já ligada àquele `mapeamento_id`.
- Na tela de detalhe (`/implementacoes/:id`): dados gerais (consultor, stakeholder, status —
  pré-requisito / semana 1-4 / concluída / cancelada), dados de acesso (conta criada via V4,
  e-mail da conta Kommo, WhatsApp Corporativo e Facebook confirmados, plano e período
  contratados), e um checklist por grupo (pré-requisito, cada semana, critérios de sucesso) —
  marcar/desmarcar um item persiste na hora.
- Os grupos/itens de checklist são editáveis em `/implementacoes/checklist` (mesmo padrão CRUD +
  reordenação da tela `/formulario`), pro POP poder evoluir sem precisar mexer em código.

### Credenciais do cliente no CRM

A seção de credenciais guarda login/senha que o cliente usa pra acessar o Kommo. A senha **nunca
fica em texto puro no banco**: é criptografada com `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt`)
usando uma chave gerada uma única vez e guardada no [Supabase Vault](https://supabase.com/docs/guides/database/vault)
(migration `0006`). A tabela `credenciais_crm` não tem nenhuma policy de RLS pra select/insert
/update — a única forma de ler ou gravar uma credencial é através de 4 funções `SECURITY DEFINER`:

- `salvar_credencial_crm` / `atualizar_credencial_crm` — recebem a senha em texto (nunca o
  bytea criptografado) e criptografam antes de gravar
- `listar_credenciais_crm` — retorna login/observações pra montar a tabela, **sem a senha**
- `revelar_credencial_crm` — descriptografa e retorna a senha, chamada só quando o usuário clica
  em "Revelar" ou "Editar" na tela; a senha nunca aparece antes desse clique explícito

Se o projeto Supabase não tiver o Vault habilitado, ative em **Database → Extensions →
`supabase_vault`** antes de rodar a migration `0006`.

## Relatório em PDF (`/mapeamento/:id/relatorio`)

Gera um documento no estilo "deck de apresentação" (fundo escuro, tipografia grande, um slide por
página) cobrindo todos os funis gerados pra um mapeamento — pensado pra apresentar ao cliente.
Aberto pelo botão "Gerar relatório em PDF" na tela do mapeamento (aparece quando já existe pelo
menos um funil), em uma aba nova.

Estrutura do documento: capa (nome do cliente) → pra cada funil, um slide de visão geral (grid com
todas as etapas) seguido de um slide de detalhe por etapa, cobrindo todos os campos do funil
(objetivo, gatilho de entrada/saída, campos obrigatórios/desejáveis, SLA, responsável, tarefas,
automação, regras de negócio/perda, script sugerido).

Não usa nenhuma biblioteca de geração de PDF — o botão "Baixar PDF" chama `window.print()` e o
usuário escolhe "Salvar como PDF" no diálogo de impressão do navegador. O CSS
(`src/pages/RelatorioFunil.css`) define um `@page` com o tamanho de slide widescreen (13.333in ×
7.5in, a mesma proporção 16:9 usada pelo PowerPoint) e cada "slide" quebra pra uma página nova via
`break-after: page`. É essencial o `-webkit-print-color-adjust: exact` — sem ele, o navegador
descarta cores de fundo na impressão e o PDF sairia em branco.

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

## A IA pode pedir esclarecimento antes de gerar

Se as respostas do formulário não derem base suficiente pra montar um funil específico e
confiável (ex: não ficou claro quem é responsável pelas etapas principais, ou não há nenhum
critério de qualificação/motivo de perda), o `SYSTEM_PROMPT` instrui a IA a responder com
`{"perguntas_esclarecimento": ["pergunta 1", ...]}` em vez de inventar informação e gerar um
funil genérico.

Quando isso acontece, `mapeamentos.status` vira `aguardando_esclarecimento` (migration `0007`,
novo valor no enum `mapeamento_status`) e as perguntas ficam salvas em
`mapeamentos.respostas._perguntas_ia`. A tela do mapeamento mostra essas perguntas com um campo
de texto pra responder — a resposta é reenviada pra Edge Function pelo mesmo mecanismo de
`instrucoes_extras` do botão de regenerar, então nenhum endpoint novo foi necessário. Se ainda
assim a IA achar que falta informação, ela pode pedir esclarecimento de novo (o formulário
continua aberto pra uma nova resposta) — mas isso só deve acontecer quando a lacuna for realmente
bloqueante; detalhes menores são preenchidos com `"[sugestão — validar com o cliente]"` em vez de
virar pergunta.

## Edge Function `gerar-funil`

Recebe `mapeamento_id` (e opcionalmente `instrucoes_extras`), monta as respostas em texto, busca
o vocabulário de `campos_padrao`, chama a API da Anthropic (Messages API,
`https://api.anthropic.com/v1/messages`) e grava os funis gerados em `funis_gerados` como uma nova
`versao`, atualizando `mapeamentos.status` para `concluido` ou `erro`.

Gere uma chave em [console.anthropic.com](https://console.anthropic.com) → **API Keys**.

Deploy e configuração via [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase functions deploy gerar-funil
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# opcional — sobrescreve o modelo padrão (claude-sonnet-5)
supabase secrets set ANTHROPIC_MODEL=claude-sonnet-5
```

`SUPABASE_URL` e `SUPABASE_ANON_KEY` já ficam disponíveis automaticamente no runtime da função.
A função usa o JWT do usuário autenticado (repassado pelo front via `supabase.functions.invoke`)
para ler/gravar os dados, então o RLS garante que cada usuário só gera funil para os próprios
mapeamentos.

O `SYSTEM_PROMPT` (`supabase/functions/gerar-funil/prompt.ts`) tem uma regra explícita de quando
separar em mais de um funil (qualificação, vendas, comparecimento, entrega/operação, pós-venda),
apontando pra quais respostas do formulário são o sinal de cada separação — em vez de deixar a
decisão totalmente a critério da IA. Vendas e Pós-venda são considerados ativamente em todo
mapeamento, mas com um critério de substância: um funil só vira funil próprio se render pelo
menos 2 etapas reais e distintas — um "funil" de pós-venda com uma etapa só vira, em vez disso, a
etapa final do funil de Vendas.
