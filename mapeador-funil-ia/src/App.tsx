import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { CamposPadrao } from './pages/CamposPadrao';
import { Dashboard } from './pages/Dashboard';
import { FormularioPublico } from './pages/FormularioPublico';
import { Login } from './pages/Login';
import { Mapeamento } from './pages/Mapeamento';
import { NovoMapeamento } from './pages/NovoMapeamento';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/formulario/:id" element={<FormularioPublico />} />
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
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
