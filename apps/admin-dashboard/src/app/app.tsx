import { RouterProvider } from 'react-router-dom';
import router from '../routes/router';
import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

export function App() {
  const { setInitializing } = useAuthStore();

  useEffect(() => {
    // Perform initial session checks (cookie handles JWT refresh automatically)
    // Simply set initializing to false on mount to let route protection run refresh logic
    setInitializing(false);
  }, [setInitializing]);

  return <RouterProvider router={router} />;
}

export default App;
