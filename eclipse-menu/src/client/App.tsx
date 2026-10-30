import { Route, Routes } from 'react-router-dom';
import MenuPage from './pages/MenuPage';
import OrderStatusPage from './pages/OrderStatusPage';
import NotFoundPage from './pages/NotFoundPage';
import LoginPage from './pages/admin/LoginPage';
import AdminLayout from './pages/admin/AdminLayout';
import DashboardPage from './pages/admin/DashboardPage';
import ItemsPage from './pages/admin/ItemsPage';
import ItemEditorPage from './pages/admin/ItemEditorPage';
import CategoriesPage from './pages/admin/CategoriesPage';
import PromotionsPage from './pages/admin/PromotionsPage';
import QrCodesPage from './pages/admin/QrCodesPage';
import SettingsPage from './pages/admin/SettingsPage';
import OrdersPage from './pages/admin/OrdersPage';
import { RequireAuth } from './lib/auth';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MenuPage />} />
      <Route path="/order/:reference" element={<OrderStatusPage />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="items" element={<ItemsPage />} />
        <Route path="items/new" element={<ItemEditorPage />} />
        <Route path="items/:id" element={<ItemEditorPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="promotions" element={<PromotionsPage />} />
        <Route path="qr" element={<QrCodesPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
