// Avatar com fallback de iniciais — usado no header (UserMenu) e na
// lista de Consultores. Nunca deixa uma imagem quebrada visível (seção
// 13 do prompt): se a URL falhar ao carregar, troca pro círculo de
// iniciais automaticamente.
import { useEffect, useState } from 'react';
import { iniciais } from '../lib/consultores';

type AvatarProps = {
  nome: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
};

export function Avatar({ nome, avatarUrl, size = 28, className }: AvatarProps) {
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    setFalhou(false);
  }, [avatarUrl]);

  const estilo = { width: size, height: size, fontSize: Math.max(10, size * 0.4) };
  const classes = `avatar${className ? ` ${className}` : ''}`;

  if (avatarUrl && !falhou) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={classes}
        style={estilo}
        onError={() => setFalhou(true)}
      />
    );
  }

  return (
    <span className={`${classes} avatar-fallback`} style={estilo} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}
