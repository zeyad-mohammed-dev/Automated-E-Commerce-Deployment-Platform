import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProductService {
  constructor(private http: HttpClient) {}

  private toParams(query: Record<string, any>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    }
    return params;
  }

  getProducts(query: Record<string, any> = {}): Observable<any> {
    return this.http.get('/api/products', { params: this.toParams(query) });
  }

  // search gives the best matches first, the rest of the query works like getProducts
  search(query: Record<string, any>): Observable<any> {
    return this.http.get('/api/search', { params: this.toParams(query) });
  }

  suggestions(q: string): Observable<any> {
    return this.http.get('/api/search/suggestions', { params: this.toParams({ q }) });
  }

  getProduct(id: string): Observable<any> {
    return this.http.get(`/api/products/${id}`);
  }

  getCategories(): Observable<any> {
    return this.http.get('/api/categories');
  }
}
