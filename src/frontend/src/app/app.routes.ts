import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { noAuthGuard } from './guards/no-auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.Home), title: 'Shopora' },
  { path: 'products', loadComponent: () => import('./pages/products/products').then((m) => m.Products), title: 'Products | Shopora' },
  { path: 'categories', loadComponent: () => import('./pages/categories/categories').then((m) => m.Categories), title: 'Categories | Shopora' },
  { path: 'products/:id', loadComponent: () => import('./pages/product-details/product-details').then((m) => m.ProductDetails) },
  { path: 'cart', loadComponent: () => import('./pages/cart/cart').then((m) => m.Cart), title: 'Cart | Shopora' },
  { path: 'checkout', canActivate: [authGuard], loadComponent: () => import('./pages/checkout/checkout').then((m) => m.Checkout), title: 'Checkout | Shopora' },
  { path: 'checkout/mock-pay', canActivate: [authGuard], loadComponent: () => import('./pages/mock-pay/mock-pay').then((m) => m.MockPay), title: 'Test payment | Shopora' },
  { path: 'checkout/result', canActivate: [authGuard], loadComponent: () => import('./pages/checkout-result/checkout-result').then((m) => m.CheckoutResult), title: 'Order | Shopora' },
  { path: 'track', loadComponent: () => import('./pages/track-order/track-order').then((m) => m.TrackOrder), title: 'Track order | Shopora' },

  { path: 'login', canActivate: [noAuthGuard], loadComponent: () => import('./pages/login/login').then((m) => m.Login), title: 'Login | Shopora' },
  { path: 'register', canActivate: [noAuthGuard], loadComponent: () => import('./pages/register/register').then((m) => m.Register), title: 'Create account | Shopora' },
  { path: 'verify-email', canActivate: [noAuthGuard], loadComponent: () => import('./pages/verify-email/verify-email').then((m) => m.VerifyEmail), title: 'Confirm email | Shopora' },
  { path: 'forgot-password', canActivate: [noAuthGuard], loadComponent: () => import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPassword), title: 'Reset password | Shopora' },

  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/account/account').then((m) => m.Account),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      { path: 'profile', loadComponent: () => import('./pages/account-profile/account-profile').then((m) => m.AccountProfile), title: 'My profile | Shopora' },
      { path: 'orders', loadComponent: () => import('./pages/account-orders/account-orders').then((m) => m.AccountOrders), title: 'My orders | Shopora' },
      { path: 'wishlist', loadComponent: () => import('./pages/account-wishlist/account-wishlist').then((m) => m.AccountWishlist), title: 'Wishlist | Shopora' },
      { path: 'security', loadComponent: () => import('./pages/account-security/account-security').then((m) => m.AccountSecurity), title: 'Security | Shopora' },
    ],
  },

  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.Admin),
    children: [
      { path: '', loadComponent: () => import('./pages/admin-overview/admin-overview').then((m) => m.AdminOverview), title: 'Dashboard | Shopora' },
      { path: 'products', loadComponent: () => import('./pages/admin-products/admin-products').then((m) => m.AdminProducts), title: 'Products | Dashboard' },
      { path: 'categories', loadComponent: () => import('./pages/admin-categories/admin-categories').then((m) => m.AdminCategories), title: 'Categories | Dashboard' },
      { path: 'orders', loadComponent: () => import('./pages/admin-orders/admin-orders').then((m) => m.AdminOrders), title: 'Orders | Dashboard' },
      { path: 'customers', loadComponent: () => import('./pages/admin-customers/admin-customers').then((m) => m.AdminCustomers), title: 'Customers | Dashboard' },
    ],
  },

  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then((m) => m.NotFound), title: 'Not found | Shopora' },
];
