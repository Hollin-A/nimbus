import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AppShell from './components/AppShell';
import BroadcastPage from './pages/BroadcastPage';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import { LiveMessagesProvider } from './socket/LiveMessagesProvider';

export default function App() {
  return (
    <AuthProvider>
      <LiveMessagesProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<HomePage />} />
              <Route path="/broadcast" element={<BroadcastPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </LiveMessagesProvider>
    </AuthProvider>
  );
}
