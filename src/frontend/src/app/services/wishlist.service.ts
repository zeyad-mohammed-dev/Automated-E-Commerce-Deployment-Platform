import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';

import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private idsSubject = new BehaviorSubject<string[]>([]);
  ids$ = this.idsSubject.asObservable();

  constructor(private http: HttpClient, private authService: AuthService) {
    // load the hearts when somebody logs in, clear them when they log out
    this.authService.user$.subscribe((user) => (user ? this.load() : this.idsSubject.next([])));
  }

  load() {
    this.http.get<any>('/api/wishlist').subscribe({
      next: (res) => this.idsSubject.next(res.data.ids),
      error: () => this.idsSubject.next([]),
    });
  }

  getProducts(): Observable<any> {
    return this.http.get<any>('/api/wishlist').pipe(tap((res) => this.idsSubject.next(res.data.ids)));
  }

  has(id: string): boolean {
    return this.idsSubject.value.includes(id);
  }

  toggle(id: string): Observable<any> {
    const request = this.has(id) ? this.http.delete<any>(`/api/wishlist/${id}`) : this.http.put<any>(`/api/wishlist/${id}`, {});
    return request.pipe(tap((res) => this.idsSubject.next(res.data.ids)));
  }
}
