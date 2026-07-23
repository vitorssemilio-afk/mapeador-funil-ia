import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export function NovoMapeamento() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const created = useRef(false);

  useEffect(() => {
    if (!user || created.current) return;
    created.current = true;
    const userId = user.id;

    async function create() {
      const { data, error: insertError } = await supabase
        .from('mapeamentos')
        .insert({
          user_id: userId,
          nome_negocio: 'Novo mapeamento',
          status: 'em_preenchimento',
          respostas: {},
        })
        .select()
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      navigate(`/mapeamento/${data.id}`, { replace: true });
    }

    create();
  }, [user, navigate]);

  if (error) return <p className="form-error">{error}</p>;
  return <div className="page-loading">Preparando seu mapeamento…</div>;
}
