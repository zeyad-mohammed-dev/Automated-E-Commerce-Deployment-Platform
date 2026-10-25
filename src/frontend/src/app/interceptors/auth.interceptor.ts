import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';

// Adds the token (if the user is logged in) and the guest id (for the cart) to every api call.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const cartService = inject(CartService);
  const router = inject(Router);

  if (!req.url.startsWith('/api')) return next(req);

  const headers: Record<string, string> = {};
  const token = authService.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (req.url.startsWith('/api/cart')) headers['x-guest-id'] = cartService.guestId;

  return next(req.clone({ setHeaders: headers })).pipe(
    catchError((error: HttpErrorResponse) => {
      // an old or revoked token: log out and ask for a new login
      const isLoginCall = req.url.startsWith('/api/auth/login');
      if (error.status === 401 && token && !isLoginCall) {
        authService.clearSession();
        router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => error);
    }),
  );
};
