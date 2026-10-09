-- A migration 0080 criou select/update em atas_reuniao, mas nenhuma
-- policy de delete — sem ela, RLS nega por padrão, mesmo pra quem tem
-- acesso ao cliente/implementação. Nem toda ata gerada no App de Atas é
-- de um cliente (reunião interna, one:one, treinamento da equipe etc.),
-- então a tela "Atas pendentes de revisão" precisa poder excluir uma ata
-- que não deveria estar ali, não só vincular. Mesma regra de acesso já
-- usada em atas_reuniao_update (administrador, ou quem já tem acesso ao
-- cliente/implementação atribuídos) — uma ata "cega" (sem nenhum vínculo)
-- só aparece e só pode ser excluída por administrador, igual já era pra
-- leitura.
create policy "atas_reuniao_delete"
  on public.atas_reuniao for delete
  to authenticated
  using (
    public.sou_administrador()
    or (implementacao_id is not null and public.tenho_acesso_a_implementacao(implementacao_id))
    or (cliente_id is not null and public.tenho_acesso_ao_cliente(cliente_id))
  );
