import { useEffect, useState } from 'react';

export function useAutoDismissMessage(initialValue = '') {
  const [message, setMessage] = useState(initialValue);

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage('');
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  return [message, setMessage];
}
