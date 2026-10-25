import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private apiUrl = '/api/checkout';

  constructor(private http: HttpClient) {}

  quote(shippingAddress: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/quote`, { shippingAddress });
  }

  start(data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/start`, data);
  }

  confirm(intentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/confirm`, { intentId });
  }

  getIntent(intentId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/intent/${intentId}`);
  }

  mockPay(intentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/mock-pay/${intentId}`, {});
  }
}
