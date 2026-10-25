import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class OrderService {
  constructor(private http: HttpClient) {}

  getMyOrders(page = 1, limit = 10): Observable<any> {
    return this.http.get('/api/orders', { params: new HttpParams().set('page', page).set('limit', limit) });
  }

  getMyOrder(orderId: string): Observable<any> {
    return this.http.get(`/api/orders/${orderId}`);
  }

  track(params: { orderId?: string; trackingId?: string; email: string }): Observable<any> {
    let query = new HttpParams().set('email', params.email);
    if (params.orderId) query = query.set('orderId', params.orderId);
    if (params.trackingId) query = query.set('trackingId', params.trackingId);
    return this.http.get('/api/track', { params: query });
  }
}
