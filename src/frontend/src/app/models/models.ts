export interface Category {
  _id: string;
  name: string;
  slug: string;
  image?: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  brand?: string;
  price: number;
  discountPercent: number;
  finalPrice: number;
  images: string[];
  rating: number;
  reviewCount: number;
  soldCount?: number;
  stockQuantity: number;
  category?: { _id?: string; id?: string; name: string; slug: string };
  createdAt?: string;
}

export interface CartLine {
  productId: string;
  quantity: number;
  name?: string;
  image?: string | null;
  price?: number;
  discountPercent?: number;
  finalPrice?: number;
  stockQuantity?: number;
  available: boolean;
  inStock: boolean;
  lineTotal: number;
}

export interface CartView {
  items: CartLine[];
  itemsCount: number;
  subtotal: number;
  currency: string;
}

export interface Address {
  streetAddress: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'user' | 'admin';
  isConfirmed: boolean;
  isBanned: boolean;
  address: Address;
  createdAt: string;
}

export interface OrderItem {
  productId: string;
  name: string | null;
  picture: string | null;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
}

export interface Order {
  orderId: string;
  userId?: string;
  email?: string;
  trackingId: string;
  currency: string;
  total: number;
  status: 'processing' | 'shipped' | 'delivered' | 'cancelled';
  customerName?: string;
  customerPhone?: string;
  shippingAddress?: Partial<Address>;
  payment?: { provider?: string; reference?: string; status?: string };
  items: OrderItem[];
  history?: { status: string; note?: string; createdAt: string }[];
  createdAt: string;
}
