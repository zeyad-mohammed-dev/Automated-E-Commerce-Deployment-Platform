import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private apiUrl = '/api/admin';

  constructor(private http: HttpClient) {}

  private toParams(query: Record<string, any>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return params;
  }

  getStats(days = 30): Observable<any> {
    return this.http.get(`${this.apiUrl}/stats`, { params: this.toParams({ days }) });
  }

  // products and categories are sent as multipart because of the pictures
  getProducts(query: Record<string, any>): Observable<any> {
    return this.http.get(`${this.apiUrl}/products`, { params: this.toParams(query) });
  }
  createProduct(form: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/products`, form);
  }
  updateProduct(id: string, form: FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/products/${id}`, form);
  }
  deleteProduct(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/products/${id}`);
  }

  getCategories(): Observable<any> {
    return this.http.get(`${this.apiUrl}/categories`);
  }
  createCategory(form: FormData): Observable<any> {
    return this.http.post(`${this.apiUrl}/categories`, form);
  }
  updateCategory(id: string, form: FormData): Observable<any> {
    return this.http.patch(`${this.apiUrl}/categories/${id}`, form);
  }
  deleteCategory(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/categories/${id}`);
  }

  getOrders(query: Record<string, any>): Observable<any> {
    return this.http.get(`${this.apiUrl}/orders`, { params: this.toParams(query) });
  }
  getOrder(orderId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/orders/${orderId}`);
  }
  updateOrderStatus(orderId: string, status: string, note?: string): Observable<any> {
    return this.http.patch(`${this.apiUrl}/orders/${orderId}/status`, { status, note });
  }

  getUsers(query: Record<string, any>): Observable<any> {
    return this.http.get(`${this.apiUrl}/users`, { params: this.toParams(query) });
  }
  setBanned(id: string, isBanned: boolean): Observable<any> {
    return this.http.patch(`${this.apiUrl}/users/${id}/ban`, { isBanned });
  }
}
