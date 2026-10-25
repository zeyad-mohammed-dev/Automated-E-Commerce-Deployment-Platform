import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';

import { CartService } from '../../services/cart.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';
import { CartView } from '../../models/models';

@Component({
  selector: 'app-cart',
  imports: [CommonModule, RouterLink, MoneyPipe],
  templateUrl: './cart.html',
  styleUrl: './cart.css',
})
export class Cart implements OnInit {
  cart: CartView | null = null;
  loading = true;
  busyId = '';
  imageOf = imageOf;

  constructor(
    private cartService: CartService,
    private authService: AuthService,
    private toastService: ToastService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.cartService.getCart().subscribe({
      next: (res) => {
        this.cart = res.data.cart;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  get canCheckout(): boolean {
    return !!this.cart && this.cart.items.some((item) => item.available) && this.cart.items.filter((item) => item.available).every((item) => item.inStock);
  }

  change(item: any, step: number) {
    this.update(item.productId, item.quantity + step);
  }

  update(productId: string, quantity: number) {
    this.busyId = productId;
    const request = quantity <= 0 ? this.cartService.remove(productId) : this.cartService.setQuantity(productId, quantity);
    request.subscribe({
      next: (res) => {
        this.cart = res.data.cart;
        this.busyId = '';
      },
      error: (error) => {
        this.busyId = '';
        this.toastService.error(error.error?.message || 'Could not update the cart');
      },
    });
  }

  checkout() {
    if (!this.authService.isLoggedIn()) {
      this.toastService.show('Please log in to continue');
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/checkout' } });
      return;
    }
    this.router.navigate(['/checkout']);
  }
}
