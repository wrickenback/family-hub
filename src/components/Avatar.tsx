import { useState } from 'react';
import './Avatar.css';

interface AvatarProps {
  name: string;
  photoURL?: string | null;
  size?: number;
}

export function Avatar({ name, photoURL, size = 40 }: AvatarProps) {
  const [errored, setErrored] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  if (photoURL && !errored) {
    return (
      <img
        src={photoURL}
        alt=""
        className="avatar-img"
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <span
      className="avatar-fallback"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
