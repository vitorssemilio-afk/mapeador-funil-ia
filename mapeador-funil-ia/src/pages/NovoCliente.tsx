import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { buscarMeuConsultor } from '../lib/consultores';
import { supabase } from '../lib/supabaseClient';
import type { Consultor } from '../types/database';

export function NovoCliente() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [nomeContato, setNomeContato] = useState('');
  const [telefone, setTelefone] = useState('');
  const [email, setEmail] = useState('');
  const [segmento, setSegmento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campo só aparece pra administrador — um consultor comum sempre vira
  // responsável pelo próprio cliente automaticamente (trigger já existente,
  // migration 0051) e não pode, pela RLS, criar em nome de outra pessoa
  // (clientes_insert_por_vinculo, migration 0062). Admin cadastrando em nome
  // de alguém (ex: time novo ainda sem rotina própria) precisa poder
  // escolher aqui — antes só dava pra corrigir depois de criar a
  // implementação, via "Transferir consultor responsável".
  const [souAdministrador, setSouAdministrador] = useState(false);
  const [consultores, setConsultores] = useState<Consultor[]>([]);
  const [consultorResponsavelId, setConsultorResponsavelId] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.rpc('sou_administrador').then(({ data }) => setSouAdministrador(data === true));

    Promise.all([
      buscarMeuConsultor(user.id),
      supabase.from('consultores').select('*').order('nome', { ascending: true }),
    ]).then(([meuConsultor, { data: consultoresData }]) => {
      const lista = consultoresData ?? [];
      setConsultores(lista);
      // Sempre deixa o <select> com um valor real selecionado desde o
      // início — senão o navegador mostraria visualmente a primeira opção
      // da lista enquanto o estado ainda achava que nada tinha sido
      // escolhido, e o cliente seria criado pra outra pessoa sem o admin
      // perceber.
      setConsultorResponsavelId(meuConsultor?.id ?? lista[0]?.id ?? '');
    });
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!nomeEmpresa.trim()) return;

    setSalvando(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from('clientes')
      .insert({
        nome_empresa: nomeEmpresa.trim(),
        nome_contato: nomeContato.trim() || null,
        telefone: telefone.trim() || null,
        email: email.trim() || null,
        segmento: segmento.trim() || null,
        // Só manda um valor explícito quando o campo de admin está visível e
        // preenchido — senão omite e deixa o trigger atribuir quem está
        // criando (comportamento de sempre pra quem não é administrador).
        ...(souAdministrador && consultorResponsavelId
          ? { consultor_responsavel_id: consultorResponsavelId }
          : {}),
      })
      .select()
      .single();

    setSalvando(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    navigate(`/clientes/${data.id}`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Novo cliente</h1>
      </div>

      <form onSubmit={handleSubmit} className="card form-card">
        {error && <p className="form-error">{error}</p>}

        <label className="field">
          <span>Nome da empresa</span>
          <input
            type="text"
            required
            autoFocus
            value={nomeEmpresa}
            onChange={(e) => setNomeEmpresa(e.target.value)}
            placeholder="Ex: Colégio Ieprol"
          />
        </label>

        <div className="form-grid">
          <label className="field">
            <span>Nome do contato</span>
            <input
              type="text"
              value={nomeContato}
              onChange={(e) => setNomeContato(e.target.value)}
              placeholder="Quem você fala do lado do cliente"
            />
          </label>

          <label className="field">
            <span>Telefone/WhatsApp</span>
            <input
              type="text"
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </label>

          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Segmento/nicho</span>
            <input
              type="text"
              value={segmento}
              onChange={(e) => setSegmento(e.target.value)}
              placeholder="Ex: Educação, Varejo, Saúde"
            />
          </label>

          {souAdministrador && (
            <label className="field">
              <span>Consultor responsável</span>
              <select
                value={consultorResponsavelId}
                onChange={(e) => setConsultorResponsavelId(e.target.value)}
              >
                {consultores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {!c.ativo ? ' (inativo)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="wizard-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvando || !nomeEmpresa.trim()}>
            {salvando ? 'Criando…' : 'Criar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
