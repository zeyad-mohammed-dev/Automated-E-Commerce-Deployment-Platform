import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { OrderService } from '../../services/order.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-track-order',
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './track-order.html',
  styleUrl: './track-order.css',
})
export class TrackOrder {
  code = '';
  email = '';
  loading = false;
  errorMessage = '';
  order: any = null;
  imageOf = imageOf;
  steps = ['processing', 'shipped', 'delivered'];

  constructor(private orderService: OrderService) {}

  track() {
    this.errorMessage = '';
    this.order = null;
    if (!this.code.trim() || !this.email.trim()) {
      this.errorMessage = 'Please enter the order number (or tracking id) and your email';
      return;
    }

    this.loading = true;
    const value = this.code.trim();
    // tracking ids look different from order ids (uuid), so we send what the customer typed in both ways
    const looksLikeOrderId = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(value);
    this.orderService.track({ email: this.email.trim(), ...(looksLikeOrderId ? { orderId: value } : { trackingId: value }) }).subscribe({
      next: (res) => {
        this.order = res.data.order;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.status === 404 ? 'We could not find an order with these details' : error.error?.message || 'Could not track the order';
        this.loading = false;
      },
    });
  }

  stepIndex(status: string): number {
    return this.steps.indexOf(status);
  }
}
