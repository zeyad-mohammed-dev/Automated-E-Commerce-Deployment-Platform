import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CartService {
  private apiUrl = '/api/cart';
  private countSubject = new BehaviorSubject<number>(0);
  count$ = this.countSubject.asObservable();

  // the app calls refreshCount() when it starts (calling it here would make the interceptor wait for this service)
  constructor(private http: HttpClient) {}

  // a visitor without an account keeps the cart under this id
  get guestId(): string {
    let id = localStorage.getItem('guestId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('guestId', id);
    }
    return id;
  }

  getCart(): Observable<any> {
    return this.http.get<any>(this.apiUrl).pipe(tap((res) => this.countSubject.next(res.data.cart.itemsCount)));
  }

  add(productId: string, quantity = 1): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/items`, { productId, quantity }).pipe(tap((res) => this.countSubject.next(res.data.cart.itemsCount)));
  }

  setQuantity(productId: string, quantity: number): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/items/${productId}`, { quantity }).pipe(tap((res) => this.countSubject.next(res.data.cart.itemsCount)));
  }

  remove(productId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/items/${productId}`).pipe(tap((res) => this.countSubject.next(res.data.cart.itemsCount)));
  }

  mergeGuestCart(): Observable<any> {
    return this.http
      .post<any>(`${this.apiUrl}/merge`, { guestId: this.guestId })
      .pipe(tap((res) => this.countSubject.next(res.data.cart.itemsCount)));
  }

  refreshCount() {
    this.getCart().subscribe({ error: () => this.countSubject.next(0) });
  }

  setCount(count: number) {
    this.countSubject.next(count);
  }
}
