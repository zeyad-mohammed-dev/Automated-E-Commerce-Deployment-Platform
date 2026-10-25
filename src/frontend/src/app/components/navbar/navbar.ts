import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { WishlistService } from '../../services/wishlist.service';
import { ProductService } from '../../services/product.service';
import { ToastService } from '../../services/toast.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-navbar',
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, MoneyPipe],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit {
  search = '';
  suggestions: any[] = [];
  showSuggestions = false;
  menuOpen = false;
  mobileOpen = false;
  imageOf = imageOf;
  private typing = new Subject<string>();

  constructor(
    public authService: AuthService,
    public cartService: CartService,
    public wishlistService: WishlistService,
    private productService: ProductService,
    private toastService: ToastService,
    private router: Router,
    private elementRef: ElementRef,
  ) {}

  ngOnInit() {
    this.typing
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((text) => (text.trim().length >= 2 ? this.productService.suggestions(text.trim()) : of(null))),
      )
      .subscribe({
        next: (res: any) => {
          this.suggestions = res?.data?.suggestions || [];
          this.showSuggestions = this.suggestions.length > 0;
        },
        error: () => (this.suggestions = []),
      });
  }

  onType() {
    this.typing.next(this.search);
  }

  submitSearch() {
    const q = this.search.trim();
    this.showSuggestions = false;
    this.router.navigate(['/products'], { queryParams: q ? { q } : {} });
  }

  openSuggestion(item: any) {
    this.showSuggestions = false;
    this.search = '';
    this.router.navigate(['/products', item.id]);
  }

  logout() {
    this.menuOpen = false;
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
    this.toastService.show('You are logged out');
  }

  @HostListener('document:click', ['$event'])
  closeMenus(event: Event) {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showSuggestions = false;
      this.menuOpen = false;
    }
  }
}
