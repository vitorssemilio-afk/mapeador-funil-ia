import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { Agenda } from './pages/Agenda';
import { CentralNotificacoes } from './pages/CentralNotificacoes';
import { CamposPadrao } from './pages/CamposPadrao';
import { CheckpointAdocao } from './pages/CheckpointAdocao';
import { ClienteDetalhe } from './pages/ClienteDetalhe';
import { Clientes } from './pages/Clientes';
import { Configuracoes } from './pages/Configuracoes';
import { ConfiguracoesPipefy } from './pages/ConfiguracoesPipefy';
import { Consultores } from './pages/Consultores';
import { Cronograma } from './pages/Cronograma';
import { Dashboard } from './pages/Dashboard';
import { EntregaImplementacao } from './pages/EntregaImplementacao';
import { FormularioAdmin } from './pages/FormularioAdmin';
import { FormularioPublico } from './pages/FormularioPublico';
import { GestaoDashboard } from './pages/GestaoDashboard';
import { ImplementacaoChecklistAdmin } from './pages/ImplementacaoChecklistAdmin';
import { ImplementacaoDetalhe } from './pages/ImplementacaoDetalhe';
import { ImplementacoesCrm } from './pages/ImplementacoesCrm';
import { Login } from './pages/Login';
import { Mapeamento } from './pages/Mapeamento';
import { NovoCliente } from './pages/NovoCliente';
import { ObservabilidadeIA } from './pages/ObservabilidadeIA';
import { RelatorioFunil } from './pages/RelatorioFunil';
import { RelatorioImplementacaoView } from './pages/RelatorioImplementacaoView';
import { RelatorioRespostas } from './pages/RelatorioRespostas';
import { ResultadosBusca } from './pages/ResultadosBusca';
import { RespostasFormulario } from './pages/RespostasFormulario';
import { TemplateDetalhe } from './pages/TemplateDetalhe';
import { Templates } from './pages/Templates';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/f/:codigo" element={<FormularioPublico />} />
                <Route path="/formulario/:id" element={<FormularioPublico />} />
                <Route path="/checkpoint/:codigo" element={<CheckpointAdocao />} />
                <Route
                  path="/mapeamento/:id/relatorio"
                  element={
                    <ProtectedRoute>
                      <RelatorioFunil />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/mapeamento/:id/respostas"
                  element={
                    <ProtectedRoute>
                      <RespostasFormulario />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/implementacoes/:id/relatorios/:relatorioId"
                  element={
                    <ProtectedRoute>
                      <RelatorioImplementacaoView />
                    </ProtectedRoute>
                  }
                />
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/gestao" element={<GestaoDashboard />} />
                  <Route path="/agenda" element={<Agenda />} />
                  <Route path="/notificacoes" element={<CentralNotificacoes />} />
                  <Route path="/cronograma" element={<Cronograma />} />
                  <Route path="/clientes" element={<Clientes />} />
                  <Route path="/clientes/novo" element={<NovoCliente />} />
                  <Route path="/clientes/:id" element={<ClienteDetalhe />} />
                  <Route path="/mapeamento/:id" element={<Mapeamento />} />
                  <Route path="/campos-padrao" element={<CamposPadrao />} />
                  <Route path="/relatorio-respostas" element={<RelatorioRespostas />} />
                  <Route path="/formulario" element={<FormularioAdmin />} />
                  <Route path="/implementacoes" element={<ImplementacoesCrm />} />
                  <Route path="/consultores" element={<Consultores />} />
                  <Route path="/observabilidade-ia" element={<ObservabilidadeIA />} />
                  <Route path="/implementacoes/checklist" element={<ImplementacaoChecklistAdmin />} />
                  <Route path="/configuracoes" element={<Configuracoes />} />
                  <Route path="/busca" element={<ResultadosBusca />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/templates/:id" element={<TemplateDetalhe />} />
                  <Route path="/configuracoes/pipefy" element={<ConfiguracoesPipefy />} />
                  <Route path="/implementacoes/:id" element={<ImplementacaoDetalhe />} />
                  <Route path="/implementacoes/:id/entrega" element={<EntregaImplementacao />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ConfirmProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;