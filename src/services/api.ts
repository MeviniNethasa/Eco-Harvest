// src/services/api.ts
//
// EcoHarvest Central API Client Layer connecting the React Native Expo app
// to the Node.js + Express + MongoDB Atlas backend at http://localhost:5000/api.
// Uses resilient fetch with error handling and fallback handling.

const API_BASE_URL = 'http://localhost:5000/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || `API request failed with status ${response.status}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Auth & User API
// ---------------------------------------------------------------------------
export const authApi = {
  register: (payload: {
    fullName: string;
    phoneNumber: string;
    role?: 'CUSTOMER' | 'FARMER';
    city?: string;
    district?: string;
    province?: string;
    subscriptionPlan?: 'STANDARD' | 'BULK_ACCESS';
    password?: string;
  }) => request<{ success: boolean; message: string; data: any }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  login: (payload: { phoneNumber: string; password?: string }) =>
    request<{ success: boolean; message: string; data: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getUser: (id: string) =>
    request<{ success: boolean; data: any }>(`/auth/user/${id}`),

  updateFavorites: (userId: string, farmerId: string) =>
    request<{ success: boolean; data: string[] }>(`/auth/user/${userId}/favorites`, {
      method: 'PATCH',
      body: JSON.stringify({ farmerId }),
    }),
};

// ---------------------------------------------------------------------------
// Product / Crop Catalog API
// ---------------------------------------------------------------------------
export const productApi = {
  getAll: (params?: { category?: string; farmerId?: string; verifiedOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.category) query.append('category', params.category);
    if (params?.farmerId) query.append('farmerId', params.farmerId);
    if (params?.verifiedOnly) query.append('verifiedOnly', 'true');
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<{ success: boolean; count: number; data: any[] }>(`/products${queryString}`);
  },

  getByFarmer: (farmerId: string) =>
    request<{ success: boolean; count: number; data: any[] }>(`/products/farmer/${farmerId}`),

  getById: (id: string) =>
    request<{ success: boolean; data: any }>(`/products/${id}`),

  create: (payload: any) =>
    request<{ success: boolean; message: string; data: any }>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    request<{ success: boolean; message: string }>(`/products/${id}`, {
      method: 'DELETE',
    }),
};

// ---------------------------------------------------------------------------
// Orders & Escrow API
// ---------------------------------------------------------------------------
export const orderApi = {
  getAll: () =>
    request<{ success: boolean; count: number; data: any[] }>('/orders'),

  getByFarmer: (farmerId: string) =>
    request<{ success: boolean; count: number; data: any[] }>(`/orders/farmer/${farmerId}`),

  getByCustomer: (customerId: string) =>
    request<{ success: boolean; count: number; data: any[] }>(`/orders/customer/${customerId}`),

  create: (payload: any) =>
    request<{ success: boolean; message: string; data: any }>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateStatus: (id: string, status: string, escrowStatus?: string) =>
    request<{ success: boolean; message: string; data: any }>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, escrowStatus }),
    }),
};

// ---------------------------------------------------------------------------
// Messaging API
// ---------------------------------------------------------------------------
export const messageApi = {
  getMessages: (conversationId: string) =>
    request<{ success: boolean; count: number; data: any[] }>(`/messages/${conversationId}`),

  sendMessage: (payload: {
    conversationId: string;
    senderId: string;
    receiverId?: string;
    orderId?: string;
    senderRole?: 'CUSTOMER' | 'FARMER';
    text: string;
  }) =>
    request<{ success: boolean; message: string; data: any }>('/messages', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getUserThreads: (userId: string) =>
    request<{ success: boolean; data: string[] }>(`/messages/threads/${userId}`),
};

// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------
export const notificationApi = {
  getNotifications: (userId: string, role?: 'CUSTOMER' | 'FARMER' | 'ALL') => {
    const roleQuery = role ? `?role=${role}` : '';
    return request<{
      success: boolean;
      count: number;
      unreadCount: number;
      data: any[];
    }>(`/notifications/${userId}${roleQuery}`);
  },

  createNotification: (payload: {
    recipientId: string;
    role?: 'CUSTOMER' | 'FARMER' | 'ALL';
    title: string;
    body?: string;
    message?: string;
    type?: string;
    data?: any;
  }) =>
    request<{ success: boolean; message: string; data: any }>('/notifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  markRead: (id: string) =>
    request<{ success: boolean; message: string; data: any }>(`/notifications/${id}/read`, {
      method: 'PATCH',
    }),

  markAllRead: (userId: string, role?: 'CUSTOMER' | 'FARMER' | 'ALL') =>
    request<{ success: boolean; message: string }>(`/notifications/read-all/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
};

// ---------------------------------------------------------------------------
// Stripe Payments API
// ---------------------------------------------------------------------------
export const stripeApi = {
  createSubscription: (payload: {
    userId?: string;
    phoneNumber?: string;
    planType?: string;
    paymentMethodId?: string;
  }) =>
    request<{
      success: boolean;
      message: string;
      data: { subscriptionId: string; status: string; plan: string; price: string };
    }>('/stripe/create-subscription', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createPaymentIntent: (amount: number, currency: string = 'lkr') =>
    request<{
      success: boolean;
      data: { clientSecret: string; amount: number; currency: string };
    }>('/stripe/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amount, currency }),
    }),
};

// ---------------------------------------------------------------------------
// Farmer Directory API
// ---------------------------------------------------------------------------
export const farmerApi = {
  getAll: (params?: { verifiedOnly?: boolean; province?: string; search?: string }) => {
    const query = new URLSearchParams();
    if (params?.verifiedOnly) query.append('verifiedOnly', 'true');
    if (params?.province) query.append('province', params.province);
    if (params?.search) query.append('search', params.search);
    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<{ success: boolean; count: number; data: any[] }>(`/farmers${queryString}`);
  },

  getById: (id: string) =>
    request<{ success: boolean; data: any }>(`/farmers/${id}`),

  saveProfile: (payload: any) =>
    request<{ success: boolean; message: string; data: any }>('/farmers/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
