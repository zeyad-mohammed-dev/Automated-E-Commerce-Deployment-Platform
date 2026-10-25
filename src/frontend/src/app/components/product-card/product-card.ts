import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { CartService } from '../../services/cart.service';
import { WishlistService } from '../../services/wishlist.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-product-card',
  imports: [CommonModule, RouterLink, MoneyPipe],
  templateUrl: './product-card.html',
  styleUrl: './product-card.css',
})
export class ProductCard {
  @Input() product: any;
  adding = false;
  imageOf = imageOf;

  constructor(
    private cartService: CartService,
    public wishlistService: WishlistService,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router,
  ) {}

  get productId(): string {
    return this.product.id || this.product._id;
  }

  get isFavorite(): boolean {
    return this.wishlistService.has(this.productId);
  }

  toggleFavorite(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.wishlistService.toggle(this.productId).subscribe({
      error: (error) => this.toastService.error(error.error?.message || 'Could not update the wishlist'),
    });
  }

  addToCart(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.adding = true;
    this.cartService.add(this.productId, 1).subscribe({
      next: () => {
        this.adding = false;
        this.toastService.success('Added to your cart');
      },
      error: (error) => {
        this.adding = false;
        this.toastService.error(error.error?.message || 'Could not add to the cart');
      },
    });
  }
}
