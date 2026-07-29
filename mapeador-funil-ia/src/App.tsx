import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { CamposPadrao } from './pages/CamposPadrao';
import { Dashboard } from './pages/Dashboard';
import { FormularioAdmin } from './pages/FormularioAdmin';
import { FormularioPublico } from './pages/FormularioPublico';
import { ImplementacaoChecklistAdmin } from './pages/ImplementacaoChecklistAdmin';
import { ImplementacaoDetalhe } from './pages/ImplementacaoDetalhe';
import { ImplementacoesCrm } from './pages/ImplementacoesCrm';
import { Login } from './pages/Login';
import { Mapeamento } from './pages/Mapeamento';
import { NovoMapeamento } from './pages/NovoMapeamento';
import { RelatorioFunil } from './pages/RelatorioFunil';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/f/:codigo" element={<FormularioPublico />} />
          <Route path="/formulario/:id" element={<FormularioPublico />} />
          <Route
            path="/mapeamento/:id/relatorio"
            element={
              <ProtectedRoute>
                <RelatorioFunil />
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
            <Route path="/novo" element={<NovoMapeamento />} />
            <Route path="/mapeamento/:id" element={<Mapeamento />} />
            <Route path="/campos-padrao" element={<CamposPadrao />} />
            <Route path="/formulario" element={<FormularioAdmin />} />
            <Route path="/implementacoes" element={<ImplementacoesCrm />} />
            <Route path="/implementacoes/checklist" element={<ImplementacaoChecklistAdmin />} />
            <Route path="/implementacoes/:id" element={<ImplementacaoDetalhe />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
