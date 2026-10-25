import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

import { CartService } from './cart.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private apiUrl = '/api/auth';
  private userSubject = new BehaviorSubject<any>(this.readUser());
  user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient, private cartService: CartService) {}

  register(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/register`, data);
  }

  confirmEmail(data: { email: string; otp: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/confirm-email`, data).pipe(tap((res) => this.saveSession(res.data)));
  }

  resendOtp(email: string, otpType = 'confirmEmail'): Observable<any> {
    return this.http.post(`${this.apiUrl}/resend-otp`, { email, otpType });
  }

  login(data: { email: string; password: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/login`, data).pipe(tap((res) => this.saveSession(res.data)));
  }

  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/forgot-password`, { email });
  }

  resetPassword(data: { email: string; otp: string; newPassword: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/reset-password`, data);
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}).pipe(tap({ next: () => this.clearSession(), error: () => this.clearSession() }));
  }

  getProfile(): Observable<any> {
    return this.http.get<any>('/api/users/me').pipe(tap((res) => this.setUser(res.data.user)));
  }

  updateProfile(data: any): Observable<any> {
    return this.http.patch<any>('/api/users/me', data).pipe(tap((res) => this.setUser(res.data.user)));
  }

  changePassword(data: { oldPassword: string; newPassword: string }): Observable<any> {
    return this.http.patch<any>('/api/users/me/password', data).pipe(
      tap((res) => localStorage.setItem('token', res.data.token)),
    );
  }

  private saveSession(data: { token: string; user: any }) {
    localStorage.setItem('token', data.token);
    this.setUser(data.user);
    // the cart the visitor filled before logging in moves to the account
    this.cartService.mergeGuestCart().subscribe({ error: () => this.cartService.refreshCount() });
  }

  setUser(user: any) {
    localStorage.setItem('user', JSON.stringify(user));
    this.userSubject.next(user);
  }

  clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.userSubject.next(null);
    this.cartService.refreshCount();
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  get user(): any {
    return this.userSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isAdmin(): boolean {
    return this.user?.role === 'admin';
  }

  private readUser(): any {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }
}
