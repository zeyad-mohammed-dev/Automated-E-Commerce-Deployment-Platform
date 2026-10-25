import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CheckoutService } from '../../services/checkout.service';
import { CartService } from '../../services/cart.service';
import { MoneyPipe } from '../../pipes/money.pipe';

@Component({
  selector: 'app-checkout-result',
  imports: [CommonModule, RouterLink, MoneyPipe],
  templateUrl: './checkout-result.html',
  styleUrl: './checkout-result.css',
})
export class CheckoutResult implements OnInit, OnDestroy {
  status: 'checking' | 'completed' | 'failed' | 'cancelled' | 'timeout' = 'checking';
  order: any = null;
  message = '';
  private intentId = '';
  private timer: any;
  private attempts = 0;
  private readonly maxAttempts = 45;

  constructor(private route: ActivatedRoute, private checkoutService: CheckoutService, private cartService: CartService) {}

  ngOnInit() {
    this.intentId = this.route.snapshot.queryParamMap.get('intent') || '';
    if (this.route.snapshot.queryParamMap.get('status') === 'cancelled') {
      this.status = 'cancelled';
      return;
    }
    this.check();
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
  }

  // The order is created on the server when the payment is confirmed, so we ask again until it exists.
  private check() {
    this.attempts++;
    this.checkoutService.confirm(this.intentId).subscribe({
      next: (res) => {
        const result = res.data;
        if (result.status === 'completed') {
          this.order = result.order;
          this.status = 'completed';
          this.cartService.refreshCount();
        } else if (result.status === 'failed') {
          this.status = 'failed';
          this.message = result.message || 'The payment failed';
        } else {
          this.retry();
        }
      },
      error: (error) => {
        this.message = error.error?.message || 'Could not check your payment';
        this.status = 'failed';
      },
    });
  }

  private retry() {
    if (this.attempts >= this.maxAttempts) {
      this.status = 'timeout';
      return;
    }
    this.timer = setTimeout(() => this.check(), 2000);
  }

  again() {
    this.status = 'checking';
    this.attempts = 0;
    this.check();
  }
}
