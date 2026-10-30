import type {
  Business,
  Category,
  DashboardStats,
  MenuItem,
  MenuPayload,
  Order,
  OrderStatus,
  Promotion,
  QrCode,
  AdminUser,
} from '../../shared/types';

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers:
        init.body instanceof FormData
          ? undefined
          : { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(body?.error ?? `Request failed (${response.status})`, response.status, body?.fields);
  }
  return body as T;
}

export const api = {
  /* ---------------- Public ---------------- */
  getMenu: () => request<MenuPayload>('/public/menu'),
  resolveQr: (token: string) => request<QrCode>(`/public/qr/${encodeURIComponent(token)}`),
  placeOrder: (payload: {
    table_identifier?: string | null;
    customer_name?: string | null;
    special_instructions?: string | null;
    qr_token?: string | null;
    items: { menu_item_id: number; quantity: number; selected_variant?: string | null; special_instructions?: string | null }[];
  }) => request<{ order: Order }>('/public/orders', { method: 'POST', body: JSON.stringify(payload) }),
  getOrder: (reference: string) => request<{ order: Order }>(`/public/orders/${encodeURIComponent(reference)}`),

  /* ---------------- Auth ---------------- */
  login: (email: string, password: string) =>
    request<{ user: AdminUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: AdminUser }>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: true; message: string }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),

  /* ---------------- Admin ---------------- */
  dashboard: () => request<{ stats: DashboardStats; recent_items: MenuItem[] }>('/admin/dashboard'),

  listItems: () => request<{ items: MenuItem[]; categories: Category[] }>('/admin/items'),
  getItem: (id: number) => request<{ item: MenuItem }>(`/admin/items/${id}`),
  createItem: (payload: unknown) => request<{ item: MenuItem }>('/admin/items', { method: 'POST', body: JSON.stringify(payload) }),
  updateItem: (id: number, payload: unknown) =>
    request<{ item: MenuItem }>(`/admin/items/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  setItemStatus: (id: number, availability_status: MenuItem['availability_status']) =>
    request<{ ok: true }>(`/admin/items/${id}/status`, { method: 'PATCH', body: JSON.stringify({ availability_status }) }),
  duplicateItem: (id: number) => request<{ item: MenuItem }>(`/admin/items/${id}/duplicate`, { method: 'POST' }),
  deleteItem: (id: number) => request<{ ok: true }>(`/admin/items/${id}`, { method: 'DELETE' }),
  reorderItems: (order: number[]) => request<{ ok: true }>('/admin/items/reorder', { method: 'POST', body: JSON.stringify({ order }) }),
  importItems: (csv: string) => request<{ created: number; errors: string[] }>('/admin/items-import', { method: 'POST', body: JSON.stringify({ csv }) }),

  listCategories: () => request<{ categories: Category[] }>('/admin/categories'),
  createCategory: (payload: unknown) => request<{ category: Category }>('/admin/categories', { method: 'POST', body: JSON.stringify(payload) }),
  updateCategory: (id: number, payload: unknown) =>
    request<{ category: Category }>(`/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCategory: (id: number) => request<{ ok: true }>(`/admin/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (order: number[]) =>
    request<{ ok: true }>('/admin/categories/reorder', { method: 'POST', body: JSON.stringify({ order }) }),

  listPromotions: () => request<{ promotions: (Promotion & { is_currently_active?: boolean })[]; clock: unknown }>('/admin/promotions'),
  createPromotion: (payload: unknown) =>
    request<{ promotion: Promotion }>('/admin/promotions', { method: 'POST', body: JSON.stringify(payload) }),
  updatePromotion: (id: number, payload: unknown) =>
    request<{ promotion: Promotion }>(`/admin/promotions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deletePromotion: (id: number) => request<{ ok: true }>(`/admin/promotions/${id}`, { method: 'DELETE' }),

  listQr: () => request<{ qr_codes: QrCode[]; base_url: string }>('/admin/qr'),
  createQr: (payload: unknown) => request<{ qr: QrCode }>('/admin/qr', { method: 'POST', body: JSON.stringify(payload) }),
  updateQr: (id: number, payload: unknown) => request<{ qr: QrCode }>(`/admin/qr/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteQr: (id: number) => request<{ ok: true }>(`/admin/qr/${id}`, { method: 'DELETE' }),

  getSettings: () => request<{ business: Business }>('/admin/settings'),
  updateSettings: (payload: unknown) => request<{ business: Business }>('/admin/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  listOrders: (status?: OrderStatus) => request<{ orders: Order[] }>(`/admin/orders${status ? `?status=${status}` : ''}`),
  setOrderStatus: (id: number, status: OrderStatus) =>
    request<{ ok: true }>(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  auditLog: () => request<{ entries: Record<string, unknown>[] }>('/admin/audit'),

  uploadImage: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string }>('/admin/uploads', { method: 'POST', body: form });
  },

  exportItemsUrl: () => '/api/admin/items-export.csv',
};
