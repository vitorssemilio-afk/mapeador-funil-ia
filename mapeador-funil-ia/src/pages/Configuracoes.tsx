// Área administrativa de Configurações (Fase 1): Implementação, Trial,
// Pipefy e Histórico. Retira duração/ciclos/prazo de treinamento/dia
// recomendado do pós-venda e os 3 períodos de Trial + alertas do código
// hardcoded (ver src/lib/configuracaoImplementacao.ts) — editável aqui por
// administradores, sem precisar alterar código.
//
// IMPORTANTE: alterar aqui NUNCA recalcula implementações já em andamento —
// cada uma usa o snapshot capturado no próprio Kickoff dela (migration
// 0073). Só afeta quem ainda não teve Kickoff e implementações futuras.
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ConfirmContext';
import { supabase } from '../lib/supabaseClient';
import type {
  CicloConfiguravel,
  ConfiguracaoAlertas,
  ConfiguracaoFormulario,
  ConfiguracaoHistoricoItem,
  ConfiguracaoIA,
  ConfiguracaoImplementacao,
  ConfiguracaoOperacao,
  ConfiguracaoPipefy,
} from '../types/database';

type AbaConfiguracoes = 'implementacao' | 'trial' | 'formulario' | 'alertas' | 'pipefy' | 'operacao' | 'ia' | 'historico';

const ABAS: { valor: AbaConfiguracoes; label: string }[] = [
  { valor: 'implementacao', label: 'Implementação' },
  { valor: 'trial', label: 'Trial' },
  { valor: 'formulario', label: 'Formulários' },
  { valor: 'alertas', label: 'Alertas' },
  { valor: 'pipefy', label: 'Pipefy' },
  { valor: 'operacao', label: 'Operação' },
  { valor: 'ia', label: 'IA' },
  { valor: 'historico', label: 'Histórico' },
];

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function urlValida(url: string): boolean {
  if (!url.trim()) return true;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

type FormImplementacao = {
  duracao_total_dias: string;
  ciclos: CicloConfiguravel[];
  prazo_treinamento_dia: string;
  dia_recomendado_formulario_pos_venda: string;
};

function paraFormImplementacao(c: ConfiguracaoImplementacao): FormImplementacao {
  return {
    duracao_total_dias: String(c.duracao_total_dias),
    ciclos: c.ciclos.map((ciclo) => ({ ...ciclo })),
    prazo_treinamento_dia: String(c.prazo_treinamento_dia),
    dia_recomendado_formulario_pos_venda: String(c.dia_recomendado_formulario_pos_venda),
  };
}

type FormTrial = {
  trial_inicial_dias: string;
  trial_extensao_14_dias: string;
  trial_extensao_7_dias: string;
  trial_alertas_dias: string; // "5, 3, 1, 0"
};

function paraFormTrial(c: ConfiguracaoImplementacao): FormTrial {
  return {
    trial_inicial_dias: String(c.trial_inicial_dias),
    trial_extensao_14_dias: String(c.trial_extensao_14_dias),
    trial_extensao_7_dias: String(c.trial_extensao_7_dias),
    trial_alertas_dias: c.trial_alertas_dias.join(', '),
  };
}

type FormPipefy = {
  url_criacao_conta: string;
  url_extensao_14: string;
  url_extensao_7: string;
  url_contratacao_definitiva: string;
};

function paraFormPipefy(c: ConfiguracaoPipefy): FormPipefy {
  return {
    url_criacao_conta: c.url_criacao_conta ?? '',
    url_extensao_14: c.url_extensao_14 ?? '',
    url_extensao_7: c.url_extensao_7 ?? '',
    url_contratacao_definitiva: c.url_contratacao_definitiva ?? '',
  };
}

type FormFormulario = {
  prazo_resposta_vendas_dias: string;
  prazo_resposta_pos_venda_dias: string;
  texto_inicial_vendas: string;
  texto_inicial_pos_venda: string;
  mensagem_conclusao_vendas: string;
  mensagem_conclusao_pos_venda: string;
  tempo_estimado_vendas_minutos: string;
  tempo_estimado_pos_venda_minutos: string;
};

function paraFormFormulario(c: ConfiguracaoFormulario): FormFormulario {
  return {
    prazo_resposta_vendas_dias: String(c.prazo_resposta_vendas_dias),
    prazo_resposta_pos_venda_dias: String(c.prazo_resposta_pos_venda_dias),
    texto_inicial_vendas: c.texto_inicial_vendas,
    texto_inicial_pos_venda: c.texto_inicial_pos_venda,
    mensagem_conclusao_vendas: c.mensagem_conclusao_vendas,
    mensagem_conclusao_pos_venda: c.mensagem_conclusao_pos_venda,
    tempo_estimado_vendas_minutos: c.tempo_estimado_vendas_minutos != null ? String(c.tempo_estimado_vendas_minutos) : '',
    tempo_estimado_pos_venda_minutos:
      c.tempo_estimado_pos_venda_minutos != null ? String(c.tempo_estimado_pos_venda_minutos) : '',
  };
}

type FormAlertas = {
  implementacao_alertas_dias: string;
  pendencia_alertas_antes_dias: string;
  pendencia_alerta_alta_dias_vencida: string;
  pendencia_alerta_critica_dias_vencida: string;
  formulario_lembrete_1_dias: string;
  formulario_lembrete_2_dias: string;
};

function paraFormAlertas(c: ConfiguracaoAlertas): FormAlertas {
  return {
    implementacao_alertas_dias: c.implementacao_alertas_dias.join(', '),
    pendencia_alertas_antes_dias: c.pendencia_alertas_antes_dias.join(', '),
    pendencia_alerta_alta_dias_vencida: String(c.pendencia_alerta_alta_dias_vencida),
    pendencia_alerta_critica_dias_vencida: String(c.pendencia_alerta_critica_dias_vencida),
    formulario_lembrete_1_dias: String(c.formulario_lembrete_1_dias),
    formulario_lembrete_2_dias: String(c.formulario_lembrete_2_dias),
  };
}

type FormOperacao = {
  nome_operacao: string;
  nome_produto: string;
  razao_social: string;
  cnpj: string;
  texto_padrao_rodape: string;
  logo_url: string;
  cor_principal: string;
};

function paraFormOperacao(c: ConfiguracaoOperacao): FormOperacao {
  return {
    nome_operacao: c.nome_operacao,
    nome_produto: c.nome_produto,
    razao_social: c.razao_social ?? '',
    cnpj: c.cnpj ?? '',
    texto_padrao_rodape: c.texto_padrao_rodape ?? '',
    logo_url: c.logo_url ?? '',
    cor_principal: c.cor_principal ?? '',
  };
}

type FormIA = {
  temperatura: string;
  permitir_perguntas_esclarecimento: boolean;
  versao_prompt_label: string;
};

function paraFormIA(c: ConfiguracaoIA): FormIA {
  return {
    temperatura: c.temperatura != null ? String(c.temperatura) : '',
    permitir_perguntas_esclarecimento: c.permitir_perguntas_esclarecimento,
    versao_prompt_label: c.versao_prompt_label ?? '',
  };
}

function parseListaNumeros(valor: string): number[] {
  return valor
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number);
}

export function Configuracoes() {
  const { user } = useAuth();
  const confirmar = useConfirm();
  const [souAdministrador, setSouAdministrador] = useState(false);
  const [aba, setAba] = useState<AbaConfiguracoes>('implementacao');

  const [configImplementacao, setConfigImplementacao] = useState<ConfiguracaoImplementacao | null>(null);
  const [formImplementacao, setFormImplementacao] = useState<FormImplementacao | null>(null);
  const [formTrial, setFormTrial] = useState<FormTrial | null>(null);
  const [configPipefy, setConfigPipefy] = useState<ConfiguracaoPipefy | null>(null);
  const [formPipefy, setFormPipefy] = useState<FormPipefy | null>(null);
  const [configFormulario, setConfigFormulario] = useState<ConfiguracaoFormulario | null>(null);
  const [formFormulario, setFormFormulario] = useState<FormFormulario | null>(null);
  const [configAlertas, setConfigAlertas] = useState<ConfiguracaoAlertas | null>(null);
  const [formAlertas, setFormAlertas] = useState<FormAlertas | null>(null);
  const [configOperacao, setConfigOperacao] = useState<ConfiguracaoOperacao | null>(null);
  const [formOperacao, setFormOperacao] = useState<FormOperacao | null>(null);
  const [configIA, setConfigIA] = useState<ConfiguracaoIA | null>(null);
  const [formIA, setFormIA] = useState<FormIA | null>(null);
  const [historico, setHistorico] = useState<ConfiguracaoHistoricoItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    setError(null);

    const [
      { data: souAdmin },
      { data: implData, error: implError },
      { data: pipefyData },
      { data: formularioData },
      { data: alertasData },
      { data: operacaoData },
      { data: iaData },
      { data: historicoData },
    ] = await Promise.all([
      supabase.rpc('sou_administrador'),
      supabase.from('configuracoes_implementacao').select('*').eq('id', true).single(),
      supabase.from('configuracoes_pipefy').select('*').eq('id', true).maybeSingle(),
      supabase.from('configuracoes_formulario').select('*').eq('id', true).maybeSingle(),
      supabase.from('configuracoes_alertas').select('*').eq('id', true).maybeSingle(),
      supabase.from('configuracoes_operacao').select('*').eq('id', true).maybeSingle(),
      supabase.from('configuracoes_ia').select('*').eq('id', true).maybeSingle(),
      supabase.from('configuracoes_historico').select('*').order('created_at', { ascending: false }).limit(100),
    ]);

    setSouAdministrador(souAdmin === true);

    if (implError) {
      setError(implError.message);
      setLoading(false);
      return;
    }

    setConfigImplementacao(implData);
    setFormImplementacao(paraFormImplementacao(implData));
    setFormTrial(paraFormTrial(implData));
    setConfigPipefy(pipefyData ?? null);
    if (pipefyData) setFormPipefy(paraFormPipefy(pipefyData));
    setConfigFormulario(formularioData ?? null);
    if (formularioData) setFormFormulario(paraFormFormulario(formularioData));
    setConfigAlertas(alertasData ?? null);
    if (alertasData) setFormAlertas(paraFormAlertas(alertasData));
    setConfigOperacao(operacaoData ?? null);
    if (operacaoData) setFormOperacao(paraFormOperacao(operacaoData));
    setConfigIA(iaData ?? null);
    if (iaData) setFormIA(paraFormIA(iaData));
    setHistorico(historicoData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function patchComparado<T extends Record<string, unknown>>(original: T, atual: T): Partial<T> {
    const patch: Partial<T> = {};
    for (const chave of Object.keys(atual) as (keyof T)[]) {
      if (JSON.stringify(atual[chave]) !== JSON.stringify(original[chave])) {
        patch[chave] = atual[chave];
      }
    }
    return patch;
  }

  async function handleSalvarImplementacao(e: FormEvent) {
    e.preventDefault();
    if (!formImplementacao || !configImplementacao) return;

    const duracao = Number(formImplementacao.duracao_total_dias);
    const prazoTreinamento = Number(formImplementacao.prazo_treinamento_dia);
    const diaPosVenda = Number(formImplementacao.dia_recomendado_formulario_pos_venda);

    if (!Number.isInteger(duracao) || duracao <= 0) {
      setError('Duração total precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(prazoTreinamento) || prazoTreinamento <= 0) {
      setError('Prazo de treinamento precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(diaPosVenda) || diaPosVenda <= 0) {
      setError('Dia recomendado do pós-venda precisa ser um número inteiro positivo.');
      return;
    }
    for (let i = 0; i < formImplementacao.ciclos.length; i++) {
      const c = formImplementacao.ciclos[i];
      if (!Number.isInteger(c.dia_inicio) || !Number.isInteger(c.dia_fim) || c.dia_inicio <= 0 || c.dia_fim <= 0) {
        setError(`Os dias do ${c.nome} precisam ser números inteiros positivos.`);
        return;
      }
      if (c.dia_fim < c.dia_inicio) {
        setError(`O dia final do ${c.nome} não pode ser antes do dia inicial.`);
        return;
      }
      if (i > 0 && c.dia_inicio <= formImplementacao.ciclos[i - 1].dia_fim) {
        setError(`Os ciclos precisam estar em ordem e não podem se sobrepor (${c.nome} começa antes do fim do ciclo anterior).`);
        return;
      }
    }
    if (formImplementacao.ciclos[formImplementacao.ciclos.length - 1].dia_fim > duracao) {
      setError('O último ciclo ultrapassa a duração total — ajuste um dos dois.');
      return;
    }

    const confirmado = await confirmar({
      titulo: 'Alterar as regras de implementação?',
      descricao:
        'Esta alteração será aplicada apenas a novas implementações iniciadas após esta mudança. Implementações já em andamento continuam com as regras vigentes no momento do Kickoff delas.',
      confirmarLabel: 'Salvar alteração',
    });
    if (!confirmado) return;

    const atual = {
      duracao_total_dias: duracao,
      ciclos: formImplementacao.ciclos,
      prazo_treinamento_dia: prazoTreinamento,
      dia_recomendado_formulario_pos_venda: diaPosVenda,
    };
    const original = {
      duracao_total_dias: configImplementacao.duracao_total_dias,
      ciclos: configImplementacao.ciclos,
      prazo_treinamento_dia: configImplementacao.prazo_treinamento_dia,
      dia_recomendado_formulario_pos_venda: configImplementacao.dia_recomendado_formulario_pos_venda,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_implementacao', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigImplementacao(data);
    setFormImplementacao(paraFormImplementacao(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  async function handleSalvarTrial(e: FormEvent) {
    e.preventDefault();
    if (!formTrial || !configImplementacao) return;

    const inicial = Number(formTrial.trial_inicial_dias);
    const ext14 = Number(formTrial.trial_extensao_14_dias);
    const ext7 = Number(formTrial.trial_extensao_7_dias);
    const alertas = formTrial.trial_alertas_dias
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);

    if (!Number.isInteger(inicial) || inicial <= 0) {
      setError('Trial inicial precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(ext14) || ext14 <= 0) {
      setError('A primeira extensão precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(ext7) || ext7 <= 0) {
      setError('A segunda extensão precisa ser um número inteiro positivo.');
      return;
    }
    if (alertas.length === 0 || alertas.some((d) => !Number.isInteger(d) || d < 0)) {
      setError('Os alertas de Trial precisam ser uma lista de números inteiros não-negativos separados por vírgula.');
      return;
    }
    // Evitar configuração que gere spam: no máximo 6 marcos de alerta.
    if (alertas.length > 6) {
      setError('No máximo 6 marcos de alerta de Trial — mais que isso vira spam de notificação.');
      return;
    }

    const confirmadoTrial = await confirmar({
      titulo: 'Alterar as regras de Trial?',
      descricao:
        'Esta alteração será aplicada apenas a novas implementações iniciadas após esta mudança. Clientes com Trial já iniciado continuam com as regras vigentes quando o Kickoff deles aconteceu.',
      confirmarLabel: 'Salvar alteração',
    });
    if (!confirmadoTrial) return;

    const atual = {
      trial_inicial_dias: inicial,
      trial_extensao_14_dias: ext14,
      trial_extensao_7_dias: ext7,
      trial_alertas_dias: [...alertas].sort((a, b) => b - a),
    };
    const original = {
      trial_inicial_dias: configImplementacao.trial_inicial_dias,
      trial_extensao_14_dias: configImplementacao.trial_extensao_14_dias,
      trial_extensao_7_dias: configImplementacao.trial_extensao_7_dias,
      trial_alertas_dias: configImplementacao.trial_alertas_dias,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_implementacao', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigImplementacao(data);
    setFormTrial(paraFormTrial(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  async function handleSalvarPipefy(e: FormEvent) {
    e.preventDefault();
    if (!formPipefy) return;

    for (const [campo, valor] of Object.entries(formPipefy)) {
      if (!urlValida(valor)) {
        setError(`URL inválida em "${campo}".`);
        return;
      }
    }

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { error: updateError } = await supabase
      .from('configuracoes_pipefy')
      .update({
        url_criacao_conta: formPipefy.url_criacao_conta.trim() || null,
        url_extensao_14: formPipefy.url_extensao_14.trim() || null,
        url_extensao_7: formPipefy.url_extensao_7.trim() || null,
        url_contratacao_definitiva: formPipefy.url_contratacao_definitiva.trim() || null,
      })
      .eq('id', true);

    setSalvando(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSalvo(true);
    setTimeout(() => setSalvo(false), 2000);
  }

  async function handleSalvarFormulario(e: FormEvent) {
    e.preventDefault();
    if (!formFormulario || !configFormulario) return;

    const prazoVendas = Number(formFormulario.prazo_resposta_vendas_dias);
    const prazoPosVenda = Number(formFormulario.prazo_resposta_pos_venda_dias);
    const tempoVendas = formFormulario.tempo_estimado_vendas_minutos.trim()
      ? Number(formFormulario.tempo_estimado_vendas_minutos)
      : null;
    const tempoPosVenda = formFormulario.tempo_estimado_pos_venda_minutos.trim()
      ? Number(formFormulario.tempo_estimado_pos_venda_minutos)
      : null;

    if (!Number.isInteger(prazoVendas) || prazoVendas <= 0) {
      setError('Prazo de resposta de vendas precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(prazoPosVenda) || prazoPosVenda <= 0) {
      setError('Prazo de resposta de pós-venda precisa ser um número inteiro positivo.');
      return;
    }
    if (!formFormulario.texto_inicial_vendas.trim() || !formFormulario.texto_inicial_pos_venda.trim()) {
      setError('O texto inicial não pode ficar vazio.');
      return;
    }
    if (!formFormulario.mensagem_conclusao_vendas.trim() || !formFormulario.mensagem_conclusao_pos_venda.trim()) {
      setError('A mensagem de conclusão não pode ficar vazia.');
      return;
    }
    if (tempoVendas !== null && (!Number.isInteger(tempoVendas) || tempoVendas <= 0)) {
      setError('O tempo estimado de vendas precisa ser um número inteiro positivo (ou vazio).');
      return;
    }
    if (tempoPosVenda !== null && (!Number.isInteger(tempoPosVenda) || tempoPosVenda <= 0)) {
      setError('O tempo estimado de pós-venda precisa ser um número inteiro positivo (ou vazio).');
      return;
    }

    const atual = {
      prazo_resposta_vendas_dias: prazoVendas,
      prazo_resposta_pos_venda_dias: prazoPosVenda,
      texto_inicial_vendas: formFormulario.texto_inicial_vendas.trim(),
      texto_inicial_pos_venda: formFormulario.texto_inicial_pos_venda.trim(),
      mensagem_conclusao_vendas: formFormulario.mensagem_conclusao_vendas.trim(),
      mensagem_conclusao_pos_venda: formFormulario.mensagem_conclusao_pos_venda.trim(),
      tempo_estimado_vendas_minutos: tempoVendas,
      tempo_estimado_pos_venda_minutos: tempoPosVenda,
    };
    const original = {
      prazo_resposta_vendas_dias: configFormulario.prazo_resposta_vendas_dias,
      prazo_resposta_pos_venda_dias: configFormulario.prazo_resposta_pos_venda_dias,
      texto_inicial_vendas: configFormulario.texto_inicial_vendas,
      texto_inicial_pos_venda: configFormulario.texto_inicial_pos_venda,
      mensagem_conclusao_vendas: configFormulario.mensagem_conclusao_vendas,
      mensagem_conclusao_pos_venda: configFormulario.mensagem_conclusao_pos_venda,
      tempo_estimado_vendas_minutos: configFormulario.tempo_estimado_vendas_minutos,
      tempo_estimado_pos_venda_minutos: configFormulario.tempo_estimado_pos_venda_minutos,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    // Textos do formulário público — não altera respostas já enviadas por
    // clientes, só o texto exibido pra quem ainda vai preencher.
    if (
      patch.texto_inicial_vendas !== undefined ||
      patch.texto_inicial_pos_venda !== undefined ||
      patch.mensagem_conclusao_vendas !== undefined ||
      patch.mensagem_conclusao_pos_venda !== undefined
    ) {
      const confirmadoTextos = await confirmar({
        titulo: 'Alterar os textos do formulário?',
        descricao:
          'Isso não modifica nem remove respostas já enviadas por clientes — vale só para quem ainda vai preencher o formulário a partir de agora.',
        confirmarLabel: 'Salvar alteração',
      });
      if (!confirmadoTextos) return;
    }

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_formulario', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigFormulario(data);
    setFormFormulario(paraFormFormulario(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  async function handleSalvarAlertas(e: FormEvent) {
    e.preventDefault();
    if (!formAlertas || !configAlertas) return;

    const implementacaoDias = parseListaNumeros(formAlertas.implementacao_alertas_dias);
    const pendenciaAntesDias = parseListaNumeros(formAlertas.pendencia_alertas_antes_dias);
    const pendenciaAlta = Number(formAlertas.pendencia_alerta_alta_dias_vencida);
    const pendenciaCritica = Number(formAlertas.pendencia_alerta_critica_dias_vencida);
    const lembrete1 = Number(formAlertas.formulario_lembrete_1_dias);
    const lembrete2 = Number(formAlertas.formulario_lembrete_2_dias);

    if (implementacaoDias.length === 0 || implementacaoDias.some((d) => !Number.isInteger(d) || d <= 0)) {
      setError('Os marcos de alerta de implementação precisam ser uma lista de números inteiros positivos separados por vírgula.');
      return;
    }
    if (implementacaoDias.length > 6) {
      setError('No máximo 6 marcos de alerta de implementação — mais que isso vira spam de notificação.');
      return;
    }
    if (pendenciaAntesDias.length === 0 || pendenciaAntesDias.some((d) => !Number.isInteger(d) || d < 0)) {
      setError('Os marcos de alerta de pendência precisam ser uma lista de números inteiros não-negativos separados por vírgula.');
      return;
    }
    if (pendenciaAntesDias.length > 6) {
      setError('No máximo 6 marcos de alerta de pendência — mais que isso vira spam de notificação.');
      return;
    }
    if (!Number.isInteger(pendenciaAlta) || pendenciaAlta <= 0) {
      setError('O limite de dias vencidos para prioridade alta precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(pendenciaCritica) || pendenciaCritica <= pendenciaAlta) {
      setError('O limite de dias vencidos para prioridade crítica precisa ser maior que o de prioridade alta.');
      return;
    }
    if (!Number.isInteger(lembrete1) || lembrete1 <= 0) {
      setError('O primeiro lembrete de formulário precisa ser um número inteiro positivo.');
      return;
    }
    if (!Number.isInteger(lembrete2) || lembrete2 <= lembrete1) {
      setError('O segundo lembrete de formulário precisa ser maior que o primeiro.');
      return;
    }

    const confirmadoAlertas = await confirmar({
      titulo: 'Alterar os alertas automáticos?',
      descricao: 'Esta alteração muda quando os alertas de implementação, pendências e formulários são disparados a partir de agora.',
      confirmarLabel: 'Salvar alteração',
    });
    if (!confirmadoAlertas) return;

    const atual = {
      implementacao_alertas_dias: [...implementacaoDias].sort((a, b) => a - b),
      pendencia_alertas_antes_dias: [...pendenciaAntesDias].sort((a, b) => b - a),
      pendencia_alerta_alta_dias_vencida: pendenciaAlta,
      pendencia_alerta_critica_dias_vencida: pendenciaCritica,
      formulario_lembrete_1_dias: lembrete1,
      formulario_lembrete_2_dias: lembrete2,
    };
    const original = {
      implementacao_alertas_dias: configAlertas.implementacao_alertas_dias,
      pendencia_alertas_antes_dias: configAlertas.pendencia_alertas_antes_dias,
      pendencia_alerta_alta_dias_vencida: configAlertas.pendencia_alerta_alta_dias_vencida,
      pendencia_alerta_critica_dias_vencida: configAlertas.pendencia_alerta_critica_dias_vencida,
      formulario_lembrete_1_dias: configAlertas.formulario_lembrete_1_dias,
      formulario_lembrete_2_dias: configAlertas.formulario_lembrete_2_dias,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_alertas', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigAlertas(data);
    setFormAlertas(paraFormAlertas(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  async function handleSalvarOperacao(e: FormEvent) {
    e.preventDefault();
    if (!formOperacao || !configOperacao) return;

    if (!formOperacao.nome_operacao.trim() || !formOperacao.nome_produto.trim()) {
      setError('Nome da operação e nome do produto não podem ficar vazios.');
      return;
    }

    const atual = {
      nome_operacao: formOperacao.nome_operacao.trim(),
      nome_produto: formOperacao.nome_produto.trim(),
      razao_social: formOperacao.razao_social.trim() || null,
      cnpj: formOperacao.cnpj.trim() || null,
      texto_padrao_rodape: formOperacao.texto_padrao_rodape.trim() || null,
      logo_url: formOperacao.logo_url.trim() || null,
      cor_principal: formOperacao.cor_principal.trim() || null,
    };
    const original = {
      nome_operacao: configOperacao.nome_operacao,
      nome_produto: configOperacao.nome_produto,
      razao_social: configOperacao.razao_social,
      cnpj: configOperacao.cnpj,
      texto_padrao_rodape: configOperacao.texto_padrao_rodape,
      logo_url: configOperacao.logo_url,
      cor_principal: configOperacao.cor_principal,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_operacao', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigOperacao(data);
    setFormOperacao(paraFormOperacao(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  async function handleSalvarIA(e: FormEvent) {
    e.preventDefault();
    if (!formIA || !configIA) return;

    const temperatura = formIA.temperatura.trim() ? Number(formIA.temperatura) : null;
    if (temperatura !== null && (Number.isNaN(temperatura) || temperatura < 0 || temperatura > 1)) {
      setError('A temperatura precisa ser um número entre 0 e 1 (ou vazio pra usar o padrão).');
      return;
    }

    const atual = {
      temperatura,
      permitir_perguntas_esclarecimento: formIA.permitir_perguntas_esclarecimento,
      versao_prompt_label: formIA.versao_prompt_label.trim() || null,
    };
    const original = {
      temperatura: configIA.temperatura,
      permitir_perguntas_esclarecimento: configIA.permitir_perguntas_esclarecimento,
      versao_prompt_label: configIA.versao_prompt_label,
    };
    const patch = patchComparado(original, atual);
    if (Object.keys(patch).length === 0) return;

    setSalvando(true);
    setError(null);
    setSalvo(false);

    const { data, error: salvarError } = await supabase.rpc('atualizar_configuracao_ia', { p_patch: patch });

    setSalvando(false);

    if (salvarError) {
      setError(salvarError.message);
      return;
    }

    setConfigIA(data);
    setFormIA(paraFormIA(data));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    carregar();
  }

  function atualizarCiclo(index: number, campo: 'dia_inicio' | 'dia_fim', valor: string) {
    if (!formImplementacao) return;
    const numero = Number(valor);
    const novosCiclos = formImplementacao.ciclos.map((c, i) => (i === index ? { ...c, [campo]: numero } : c));
    setFormImplementacao({ ...formImplementacao, ciclos: novosCiclos });
  }

  if (loading) {
    return (
      <div className="page">
        <p className="page-loading">Carregando…</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Configurações</h1>
          <p className="field-hint">
            Regras operacionais da implementação, Trial, Pipefy e histórico de alterações — editáveis aqui sem
            precisar mexer em código. Alterar aqui nunca recalcula implementações já em andamento: cada uma
            preserva as regras que valiam no momento do próprio Kickoff.
          </p>
        </div>
      </div>

      {!souAdministrador && (
        <p className="field-hint">
          Você pode visualizar as configurações vigentes, mas só administradores podem alterá-las.
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      <div className="tabs">
        {ABAS.filter((a) => a.valor !== 'historico' || souAdministrador).map((a) => (
          <button
            key={a.valor}
            type="button"
            className={`tab-button${aba === a.valor ? ' active' : ''}`}
            onClick={() => setAba(a.valor)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'implementacao' && formImplementacao && configImplementacao && (
        <form onSubmit={handleSalvarImplementacao} className="card form-card">
          <h2>Implementação</h2>
          <p className="field-hint">
            {configImplementacao.atualizado_por_email
              ? `Última alteração por ${configImplementacao.atualizado_por_email} em ${formatarDataHora(configImplementacao.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>

          <label className="field">
            <span>Duração padrão da implementação (dias)</span>
            <input
              type="number"
              min={1}
              value={formImplementacao.duracao_total_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormImplementacao({ ...formImplementacao, duracao_total_dias: e.target.value })}
            />
          </label>

          <h3>Ciclos</h3>
          {formImplementacao.ciclos.map((ciclo, i) => (
            <div className="form-grid" key={ciclo.numero}>
              <label className="field">
                <span>{ciclo.nome} — Dia inicial</span>
                <input
                  type="number"
                  min={1}
                  value={ciclo.dia_inicio}
                  disabled={!souAdministrador}
                  onChange={(e) => atualizarCiclo(i, 'dia_inicio', e.target.value)}
                />
              </label>
              <label className="field">
                <span>{ciclo.nome} — Dia final</span>
                <input
                  type="number"
                  min={1}
                  value={ciclo.dia_fim}
                  disabled={!souAdministrador}
                  onChange={(e) => atualizarCiclo(i, 'dia_fim', e.target.value)}
                />
              </label>
            </div>
          ))}

          <label className="field">
            <span>Prazo recomendado para o treinamento (até o dia)</span>
            <input
              type="number"
              min={1}
              value={formImplementacao.prazo_treinamento_dia}
              disabled={!souAdministrador}
              onChange={(e) => setFormImplementacao({ ...formImplementacao, prazo_treinamento_dia: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Dia recomendado para envio do formulário de pós-venda</span>
            <input
              type="number"
              min={1}
              value={formImplementacao.dia_recomendado_formulario_pos_venda}
              disabled={!souAdministrador}
              onChange={(e) =>
                setFormImplementacao({ ...formImplementacao, dia_recomendado_formulario_pos_venda: e.target.value })
              }
            />
            <span className="field-hint">
              Hoje é só uma referência exibida aqui — não dispara nenhum alerta automático ainda.
            </span>
          </label>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'trial' && formTrial && configImplementacao && (
        <form onSubmit={handleSalvarTrial} className="card form-card">
          <h2>Trial Kommo</h2>
          <p className="field-hint">
            {configImplementacao.atualizado_por_email
              ? `Última alteração por ${configImplementacao.atualizado_por_email} em ${formatarDataHora(configImplementacao.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>

          <label className="field">
            <span>Trial inicial (dias)</span>
            <input
              type="number"
              min={1}
              value={formTrial.trial_inicial_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_inicial_dias: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Primeira extensão (dias)</span>
            <input
              type="number"
              min={1}
              value={formTrial.trial_extensao_14_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_extensao_14_dias: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Segunda extensão (dias)</span>
            <input
              type="number"
              min={1}
              value={formTrial.trial_extensao_7_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_extensao_7_dias: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Alertas (dias antes do vencimento, separados por vírgula)</span>
            <input
              type="text"
              placeholder="5, 3, 1, 0"
              value={formTrial.trial_alertas_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormTrial({ ...formTrial, trial_alertas_dias: e.target.value })}
            />
            <span className="field-hint">Máximo de 6 marcos, pra não virar spam de notificação.</span>
          </label>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'pipefy' && formPipefy && (
        <form onSubmit={handleSalvarPipefy} className="card form-card">
          <h2>Links do Pipefy</h2>
          <p className="field-hint">
            Essas URLs aparecem como botão de ação na seção Trial Kommo de toda implementação — sem integração
            com a API do Pipefy nesta versão, só o link direto.
          </p>

          {(
            [
              { campo: 'url_criacao_conta', label: 'URL de solicitação da criação da conta Kommo' },
              { campo: 'url_extensao_14', label: 'URL de solicitação de +14 dias' },
              { campo: 'url_extensao_7', label: 'URL de solicitação de +7 dias' },
              { campo: 'url_contratacao_definitiva', label: 'URL de contratação definitiva' },
            ] as const
          ).map(({ campo, label }) => (
            <label className="field" key={campo}>
              <span>{label}</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="url"
                  value={formPipefy[campo]}
                  disabled={!souAdministrador}
                  onChange={(e) => setFormPipefy({ ...formPipefy, [campo]: e.target.value })}
                  placeholder="https://app.pipefy.com/..."
                  style={{ flex: 1 }}
                />
                {formPipefy[campo] && urlValida(formPipefy[campo]) && (
                  <a href={formPipefy[campo]} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                    Abrir
                  </a>
                )}
              </div>
              {formPipefy[campo] && !urlValida(formPipefy[campo]) && (
                <span className="form-error">URL inválida.</span>
              )}
            </label>
          ))}

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'pipefy' && !formPipefy && !configPipefy && (
        <div className="empty-state">
          <p>Nenhuma configuração de Pipefy encontrada.</p>
        </div>
      )}

      {aba === 'formulario' && formFormulario && configFormulario && (
        <form onSubmit={handleSalvarFormulario} className="card form-card">
          <h2>Formulários</h2>
          <p className="field-hint">
            {configFormulario.atualizado_por_email
              ? `Última alteração por ${configFormulario.atualizado_por_email} em ${formatarDataHora(configFormulario.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>
          <p className="field-hint">
            Os prazos abaixo são só referência exibida — quem realmente controla quando um alerta de "fora do
            prazo" dispara é a aba Alertas.
          </p>

          <div className="form-grid">
            <label className="field">
              <span>Prazo de resposta — Vendas (dias)</span>
              <input
                type="number"
                min={1}
                value={formFormulario.prazo_resposta_vendas_dias}
                disabled={!souAdministrador}
                onChange={(e) => setFormFormulario({ ...formFormulario, prazo_resposta_vendas_dias: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Prazo de resposta — Pós-venda (dias)</span>
              <input
                type="number"
                min={1}
                value={formFormulario.prazo_resposta_pos_venda_dias}
                disabled={!souAdministrador}
                onChange={(e) =>
                  setFormFormulario({ ...formFormulario, prazo_resposta_pos_venda_dias: e.target.value })
                }
              />
            </label>
          </div>

          <label className="field">
            <span>Texto inicial — Vendas</span>
            <textarea
              rows={2}
              value={formFormulario.texto_inicial_vendas}
              disabled={!souAdministrador}
              onChange={(e) => setFormFormulario({ ...formFormulario, texto_inicial_vendas: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Texto inicial — Pós-venda</span>
            <textarea
              rows={2}
              value={formFormulario.texto_inicial_pos_venda}
              disabled={!souAdministrador}
              onChange={(e) => setFormFormulario({ ...formFormulario, texto_inicial_pos_venda: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Mensagem de conclusão — Vendas</span>
            <textarea
              rows={2}
              value={formFormulario.mensagem_conclusao_vendas}
              disabled={!souAdministrador}
              onChange={(e) => setFormFormulario({ ...formFormulario, mensagem_conclusao_vendas: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Mensagem de conclusão — Pós-venda</span>
            <textarea
              rows={2}
              value={formFormulario.mensagem_conclusao_pos_venda}
              disabled={!souAdministrador}
              onChange={(e) =>
                setFormFormulario({ ...formFormulario, mensagem_conclusao_pos_venda: e.target.value })
              }
            />
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Tempo estimado — Vendas (minutos, opcional)</span>
              <input
                type="number"
                min={1}
                value={formFormulario.tempo_estimado_vendas_minutos}
                disabled={!souAdministrador}
                onChange={(e) =>
                  setFormFormulario({ ...formFormulario, tempo_estimado_vendas_minutos: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Tempo estimado — Pós-venda (minutos, opcional)</span>
              <input
                type="number"
                min={1}
                value={formFormulario.tempo_estimado_pos_venda_minutos}
                disabled={!souAdministrador}
                onChange={(e) =>
                  setFormFormulario({ ...formFormulario, tempo_estimado_pos_venda_minutos: e.target.value })
                }
              />
            </label>
          </div>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'alertas' && formAlertas && configAlertas && (
        <form onSubmit={handleSalvarAlertas} className="card form-card">
          <h2>Alertas e notificações</h2>
          <p className="field-hint">
            {configAlertas.atualizado_por_email
              ? `Última alteração por ${configAlertas.atualizado_por_email} em ${formatarDataHora(configAlertas.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>

          <label className="field">
            <span>Implementação — dias (desde o Kickoff) em que avisa, separados por vírgula</span>
            <input
              type="text"
              placeholder="30, 35, 40"
              value={formAlertas.implementacao_alertas_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormAlertas({ ...formAlertas, implementacao_alertas_dias: e.target.value })}
            />
            <span className="field-hint">Máximo de 6 marcos, pra não virar spam de notificação.</span>
          </label>

          <label className="field">
            <span>Pendências — dias antes do vencimento em que avisa, separados por vírgula</span>
            <input
              type="text"
              placeholder="3, 1, 0"
              value={formAlertas.pendencia_alertas_antes_dias}
              disabled={!souAdministrador}
              onChange={(e) => setFormAlertas({ ...formAlertas, pendencia_alertas_antes_dias: e.target.value })}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Pendências — dias vencida para virar prioridade Alta</span>
              <input
                type="number"
                min={1}
                value={formAlertas.pendencia_alerta_alta_dias_vencida}
                disabled={!souAdministrador}
                onChange={(e) =>
                  setFormAlertas({ ...formAlertas, pendencia_alerta_alta_dias_vencida: e.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Pendências — dias vencida para virar prioridade Crítica</span>
              <input
                type="number"
                min={1}
                value={formAlertas.pendencia_alerta_critica_dias_vencida}
                disabled={!souAdministrador}
                onChange={(e) =>
                  setFormAlertas({ ...formAlertas, pendencia_alerta_critica_dias_vencida: e.target.value })
                }
              />
            </label>
          </div>

          <div className="form-grid">
            <label className="field">
              <span>Formulário — primeiro lembrete (dias sem resposta)</span>
              <input
                type="number"
                min={1}
                value={formAlertas.formulario_lembrete_1_dias}
                disabled={!souAdministrador}
                onChange={(e) => setFormAlertas({ ...formAlertas, formulario_lembrete_1_dias: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Formulário — segundo lembrete (dias sem resposta)</span>
              <input
                type="number"
                min={1}
                value={formAlertas.formulario_lembrete_2_dias}
                disabled={!souAdministrador}
                onChange={(e) => setFormAlertas({ ...formAlertas, formulario_lembrete_2_dias: e.target.value })}
              />
            </label>
          </div>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'operacao' && formOperacao && configOperacao && (
        <form onSubmit={handleSalvarOperacao} className="card form-card">
          <h2>Operação</h2>
          <p className="field-hint">
            {configOperacao.atualizado_por_email
              ? `Última alteração por ${configOperacao.atualizado_por_email} em ${formatarDataHora(configOperacao.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>
          <p className="field-hint">
            Esses dados definem o nome exibido na interface (login, topo das páginas, relatório em PDF). Não
            implementa múltiplas operações simultâneas nesta versão — vale pra toda a instalação.
          </p>

          <div className="form-grid">
            <label className="field">
              <span>Nome da operação</span>
              <input
                type="text"
                value={formOperacao.nome_operacao}
                disabled={!souAdministrador}
                onChange={(e) => setFormOperacao({ ...formOperacao, nome_operacao: e.target.value })}
              />
            </label>
            <label className="field">
              <span>Nome exibido do produto</span>
              <input
                type="text"
                value={formOperacao.nome_produto}
                disabled={!souAdministrador}
                onChange={(e) => setFormOperacao({ ...formOperacao, nome_produto: e.target.value })}
              />
            </label>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Razão social (opcional)</span>
              <input
                type="text"
                value={formOperacao.razao_social}
                disabled={!souAdministrador}
                onChange={(e) => setFormOperacao({ ...formOperacao, razao_social: e.target.value })}
              />
            </label>
            <label className="field">
              <span>CNPJ (opcional)</span>
              <input
                type="text"
                value={formOperacao.cnpj}
                disabled={!souAdministrador}
                onChange={(e) => setFormOperacao({ ...formOperacao, cnpj: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            <span>Texto padrão de rodapé (opcional)</span>
            <textarea
              rows={2}
              value={formOperacao.texto_padrao_rodape}
              disabled={!souAdministrador}
              onChange={(e) => setFormOperacao({ ...formOperacao, texto_padrao_rodape: e.target.value })}
            />
          </label>

          <p className="field-hint">
            Usados nos documentos do módulo de Relatórios e Entrega (capa, cabeçalho) — não cria uma configuração
            separada, é a mesma identidade da operação.
          </p>
          <div className="form-grid">
            <label className="field">
              <span>URL do logo (opcional)</span>
              <input
                type="text"
                value={formOperacao.logo_url}
                disabled={!souAdministrador}
                onChange={(e) => setFormOperacao({ ...formOperacao, logo_url: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <label className="field">
              <span>Cor principal (opcional)</span>
              <input
                type="text"
                value={formOperacao.cor_principal}
                disabled={!souAdministrador}
                onChange={(e) => setFormOperacao({ ...formOperacao, cor_principal: e.target.value })}
                placeholder="#D42A42"
              />
            </label>
          </div>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'ia' && formIA && configIA && (
        <form onSubmit={handleSalvarIA} className="card form-card">
          <h2>IA</h2>
          <p className="field-hint">
            {configIA.atualizado_por_email
              ? `Última alteração por ${configIA.atualizado_por_email} em ${formatarDataHora(configIA.updated_at)}.`
              : 'Nenhuma alteração registrada ainda — valores padrão do sistema.'}
          </p>
          <p className="field-hint">
            Só parâmetros não sensíveis. A chave de API continua guardada em ambiente seguro do servidor, nunca
            aqui. O conteúdo do prompt em si também não é editável por aqui nesta versão.
          </p>

          <label className="field">
            <span>Temperatura (0 a 1, opcional — vazio usa o padrão do modelo)</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={formIA.temperatura}
              disabled={!souAdministrador}
              onChange={(e) => setFormIA({ ...formIA, temperatura: e.target.value })}
            />
            <span className="field-hint">
              Controla o quanto a IA varia a resposta. Mais perto de 0 = respostas mais previsíveis e
              consistentes entre gerações; mais perto de 1 = respostas mais variadas. Na dúvida, deixe em branco.
            </span>
          </label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={formIA.permitir_perguntas_esclarecimento}
              disabled={!souAdministrador}
              onChange={(e) => setFormIA({ ...formIA, permitir_perguntas_esclarecimento: e.target.checked })}
            />
            <span>Permitir que a IA faça perguntas de esclarecimento antes de gerar o funil</span>
          </label>
          <p className="field-hint">
            Desligado, a IA nunca para pra perguntar — ela gera o funil direto, assumindo o cenário mais provável
            quando faltar alguma informação.
          </p>
          <label className="field">
            <span>Etiqueta da versão do prompt (opcional, só informativo)</span>
            <input
              type="text"
              value={formIA.versao_prompt_label}
              disabled={!souAdministrador}
              onChange={(e) => setFormIA({ ...formIA, versao_prompt_label: e.target.value })}
            />
          </label>

          {souAdministrador && (
            <div className="wizard-actions">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : salvo ? 'Salvo!' : 'Salvar'}
              </button>
            </div>
          )}
        </form>
      )}

      {aba === 'historico' && souAdministrador && (
        <section className="card">
          <h2>Histórico de alterações</h2>
          {historico.length === 0 ? (
            <div className="empty-state">
              <p>Nenhuma alteração registrada ainda.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table data-table-cards-mobile">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>Valor anterior</th>
                    <th>Novo valor</th>
                    <th>Usuário</th>
                    <th>Data/hora</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id}>
                      <td data-label="Campo">{h.campo}</td>
                      <td data-label="Valor anterior">{JSON.stringify(h.valor_anterior)}</td>
                      <td data-label="Novo valor">{JSON.stringify(h.valor_novo)}</td>
                      <td data-label="Usuário">{h.alterado_por_email ?? '—'}</td>
                      <td data-label="Data/hora">{formatarDataHora(h.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
