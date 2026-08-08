import { RouterProvider } from 'react-router-dom';
import router from '../routes/router';
import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

export function App() {
  const { restoreSession } = useAuthStore();

  useEffect(() => {
    // Attempt to restore admin session from httpOnly cookie on app mount
    void restoreSession();
  }, [restoreSession]);

  return <RouterProvider router={router} />;
}

export default App;
