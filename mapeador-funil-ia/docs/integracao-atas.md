# Integração com o App de Atas — contrato (MVP)

Documento pra quem for adaptar o App de Atas a enviar atas pro Mapeador de Funil IA. Cobre só o que já está implementado nesta primeira versão (ver seção "Limitações" no fim).

## Endpoint

```
POST <SUPABASE_PROJECT_URL>/functions/v1/webhook-atas
Content-Type: application/json
Authorization: Bearer <ATAS_WEBHOOK_SECRET>
```

`<SUPABASE_PROJECT_URL>` é a URL do projeto Supabase do Mapeador (ex: `https://xxxxx.supabase.co`). `<ATAS_WEBHOOK_SECRET>` é um segredo único, combinado fora de banda e guardado só como variável de ambiente nos dois lados — nunca em frontend, nunca em log. É configurado no Mapeador como secret da Edge Function `webhook-atas` (`supabase secrets set ATAS_WEBHOOK_SECRET=...`).

Chamada servidor-a-servidor — não tem relação com login de usuário do Mapeador.

## Autenticação

- Header `Authorization: Bearer <secret>`.
- Sem o header, ou com o secret errado: `401`.
- O secret é o mesmo em todo ambiente (um por ambiente — dev/staging/produção têm segredos diferentes).

## Identificação do cliente/reunião (importante)

Nunca identificamos cliente só pelo nome. Prioridade, da mais confiável pra menos confiável:

1. `reuniao_id` (se o App de Atas souber o id da reunião no Mapeador, é a única forma garantida de vínculo correto)
2. `implementacao_id` + `tipo_reuniao` + `data_reuniao` (tenta achar a reunião por tipo e data aproximada, ±48h)
3. `cliente_id` sozinho (fica como "requer revisão" — vínculo manual)
4. Nada informado (fica como "requer revisão")

**Recomendação forte:** quando o Mapeador cria uma reunião, ele pode entregar o `reuniao_id` pro App de Atas no momento de agendar/iniciar a gravação. Isso elimina qualquer ambiguidade.

## Payload

```json
{
  "external_minute_id": "ata_123456",
  "integration_source": "app_atas",
  "cliente_id": "uuid-ou-null",
  "implementacao_id": "uuid-ou-null",
  "reuniao_id": "uuid-ou-null",
  "tipo_reuniao": "checkin_1",
  "titulo": "Check-in 1",
  "data_reuniao": "2026-10-04T14:00:00-03:00",
  "participantes": [
    { "nome": "João Silva", "papel": "Cliente" }
  ],
  "resumo": "...",
  "decisoes": [
    { "titulo": "Alterar follow-up", "descricao": "..." }
  ],
  "acoes": [
    {
      "titulo": "Enviar acesso ao Meta",
      "descricao": "...",
      "responsavel_nome": "João",
      "responsavel_tipo": "cliente",
      "prazo_sugerido": "2026-10-08"
    }
  ],
  "conteudo_original": "...",
  "gerada_em": "2026-10-04T15:00:00-03:00"
}
```

### Campos obrigatórios

- `external_minute_id` (string) — id da ata no App de Atas. Usado como chave de idempotência junto com `integration_source`.
- Pelo menos um entre `resumo` e `conteudo_original`.

### Campos opcionais

Todos os demais. `tipo_reuniao` deve ser um dos tipos já usados pelo Mapeador (`kickoff`, `treinamento`, `checkin_1`, `checkin_2`, `tira_duvidas`, `reuniao_final`, `extraordinaria`) quando informado — só é usado pro fallback de vínculo (prioridade 2 acima), nunca é obrigatório.

`responsavel_tipo` em cada ação, quando informado, deve ser `"cliente"` ou `"interna"` — qualquer outro valor é ignorado (fica `null`, o consultor define na revisão).

## Respostas

**Recebida e vinculada com sucesso:**
```json
{ "success": true, "status": "received", "minute_id": "uuid", "meeting_id": "uuid-ou-null" }
```

**Reenvio idêntico (idempotência):**
```json
{ "success": true, "status": "already_processed", "minute_id": "uuid" }
```

**Vínculo incerto (ata foi salva, mas precisa de revisão manual no Mapeador):**
```json
{ "success": true, "status": "requires_link", "minute_id": "uuid", "message": "..." }
```

**Vínculo inválido (reuniao_id não bate com cliente/implementação informados — nada foi salvo com vínculo errado):**
```json
{ "success": false, "status": "requires_link", "minute_id": "uuid", "message": "..." }
```

**Erro de validação (payload malformado, sem campos obrigatórios):**
```json
{ "success": false, "status": "error", "message": "..." }
```
HTTP 400.

**Não autenticado:**
```json
{ "success": false, "status": "error", "message": "Não autenticado." }
```
HTTP 401.

**Erro interno:**
```json
{ "success": false, "status": "error", "message": "Não foi possível salvar a ata." }
```
HTTP 500. Nunca expõe stack trace ou detalhe técnico no corpo — isso fica só no log interno (`atas_integracao_log`, visível a administradores em Observabilidade → Integração de Atas).

## Idempotência e retry

- Chave: `(integration_source, external_minute_id)`.
- Reenviar a MESMA ata (conteúdo idêntico) nunca duplica — responde `already_processed`.
- Reenviar com conteúdo DIFERENTE pro mesmo `external_minute_id` cria uma nova versão internamente (a anterior nunca é sobrescrita).
- Em caso de falha de rede/timeout, o App de Atas pode tentar novamente com segurança — o pior caso é um `already_processed`.

## O que NÃO acontece automaticamente

- **Nenhuma pendência é criada automaticamente.** As `acoes` do payload ficam como sugestão aguardando revisão de um consultor dentro do Mapeador; viram pendência rastreável só quando o consultor confirmar.
- **O status da reunião nunca é alterado pela ata.** Receber a ata não marca a reunião como "realizada" — isso continua sendo feito pelo fluxo normal do Mapeador.

## Fallback manual

Se o webhook falhar ou a reunião tiver acontecido fora do fluxo automático, o Mapeador tem um botão "Importar ata" na aba Reuniões de cada implementação (cola resumo/conteúdo, escolhe a reunião se souber qual é). Não depende da integração.

## Limitações desta primeira versão

- Sem sincronização bidirecional — o Mapeador nunca escreve de volta no App de Atas.
- Sem edição de ata dentro do Mapeador além de vínculo/revisão de ações — editar o conteúdo da ata continua sendo trabalho do App de Atas.
- Um único segredo por ambiente (sem múltiplas integrações/apps de ata diferentes nesta versão).
- Atas e o novo campo de pendência-de-ata ainda não aparecem na Busca Global.
- Sem indicador de "ações de ata aguardando revisão" na Home — hoje isso só aparece via a notificação (sino/Central de Notificações) e dentro da própria reunião.
