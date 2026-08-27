// src/services/api.ts
//
// EcoHarvest Central API Client Layer connecting the React Native Expo app
// to the Node.js + Express + MongoDB Atlas backend at http://localhost:5000/api.
// Uses resilient fetch with error handling and fallback handling.

import { Platform } from 'react-native';

/**
 * Platform-aware base URL:
 * - Android Emulator: 10.0.2.2 is the special alias for the host machine loopback.
 * - iOS Simulator / Expo Web: 127.0.0.1 resolves to the Mac host correctly.
 */
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android'
    ? 'http://10.0.2.2:5000/api'
    : 'http://127.0.0.1:5000/api');

console.log(`[EcoHarvest API] Base URL: ${API_BASE_URL} (Platform: ${Platform.OS})`);

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...((options.headers as Record<string, string>) || {}),
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
    isBulkBuyer?: boolean;
    bulkAccessPlan?: string;
    password?: string;
    farmName?: string;
    ownerName?: string;
    slsiCertificateUrl?: string;
    bankDetails?: any;
    isNewRegistration?: boolean;
    userId?: string;
  }) => request<{ success: boolean; message: string; data: any }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  checkPhone: (phoneNumber: string) =>
    request<{ success: boolean; isRegistered: boolean; message: string }>('/auth/check-phone', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),

  login: (payload: { phoneNumber?: string; fullName?: string; password?: string }) =>
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

  createProduct: (payload: any) =>
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

  updateReview: (id: string, payload: {
    freshnessScore?: number;
    freshnessGrade?: string;
    reviewRating?: number;
    reviewComment?: string;
    reviewId?: string;
  }) =>
    request<{ success: boolean; message: string; data: any }>(`/orders/${id}/review`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
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

  getProfile: (id: string) =>
    request<{ success: boolean; data: any }>(`/farmers/${id}`),

  saveProfile: (payload: any) =>
    request<{ success: boolean; message: string; data: any }>('/farmers/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

// ---------------------------------------------------------------------------
// AI & Computer Vision Service API (Express Proxy -> Python Service :5002)
// ---------------------------------------------------------------------------
export const aiApi = {
  extractHandwrittenList: (payload: FormData | { imageUri?: string; imageBase64?: string; text?: string }) => {
    const isFormData = typeof FormData !== 'undefined' && payload instanceof FormData;
    return request<{
      success: boolean;
      source: string;
      raw_text?: string;
      extracted_items?: any[];
      items?: any[];
      data?: any;
    }>('/ai/extract-handwritten-list', {
      method: 'POST',
      body: isFormData ? payload : JSON.stringify(payload),
    });
  },

  assessFreshness: (payload: {
    imageUri?: string;
    imageBase64?: string;
    cropCategory?: string;
    cropName?: string;
  }) =>
    request<{
      success: boolean;
      source: string;
      data: {
        cropName: string;
        predictedState: string;
        freshnessScore: number;
        confidence: number;
        isSLSIVerified: boolean;
        slsiGrade: string;
        visualInspection?: any;
        shelfLifeEstimateDays?: number;
      };
    }>('/ai/assess-freshness', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  moderateContent: (payload: { text: string; context?: 'chat' | 'review' }) =>
    request<{
      success: boolean;
      allowed: boolean;
      category?: string;
      reason?: string;
      source?: string;
    }>('/ai/moderate-content', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getHealth: () =>
    request<{ success: boolean; service: string; pythonServiceStatus: string }>('/ai/health'),
};

// ---------------------------------------------------------------------------
// Phase 3 Desktop Admin Command Panel API
// ---------------------------------------------------------------------------
export const adminApi = {
  // Screen A-01: SLSI Verification Desk
  getVerifications: () =>
    request<{ success: boolean; count: number; data: any[] }>('/admin/verifications'),

  approveVerification: (id: string, commissionRate: number = 2.5) =>
    request<{ success: boolean; message: string; data: any }>(`/admin/verifications/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ commissionRate }),
    }),

  rejectVerification: (id: string, reason?: string) =>
    request<{ success: boolean; message: string; data: any }>(`/admin/verifications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Screen A-02: Moderated Chat Interception Feed
  getModeratedChats: () =>
    request<{ success: boolean; count: number; data: any[] }>('/admin/moderation/chats'),

  overrideModeration: (ticketId: string, action: 'ALLOW' | 'BLOCK' | 'SUSPEND') =>
    request<{ success: boolean; message: string; ticket: any }>('/admin/moderation/override', {
      method: 'POST',
      body: JSON.stringify({ ticketId, action }),
    }),

  // Screen A-03: Escrow Ledger & Uber Logistics
  getEscrowLedger: () =>
    request<{ success: boolean; count: number; data: any[] }>('/admin/escrow/ledger'),

  forceReleaseEscrow: (masterPaymentIntentId: string, reason?: string) =>
    request<{ success: boolean; message: string; data: any }>('/admin/escrow/force-release', {
      method: 'POST',
      body: JSON.stringify({ masterPaymentIntentId, reason }),
    }),

  refundEscrow: (masterPaymentIntentId: string, reason?: string) =>
    request<{ success: boolean; message: string; data: any }>('/admin/escrow/refund', {
      method: 'POST',
      body: JSON.stringify({ masterPaymentIntentId, reason }),
    }),

  // Screen A-04: Ecosystem Analytics & Health
  getAnalyticsHealth: () =>
    request<{ success: boolean; data: any }>('/admin/analytics/health'),

  // Purge Demo Data
  purgeDemoData: () =>
    request<{ success: boolean; message: string; purged: any }>('/admin/purge-demo-data', {
      method: 'POST',
    }),
};
