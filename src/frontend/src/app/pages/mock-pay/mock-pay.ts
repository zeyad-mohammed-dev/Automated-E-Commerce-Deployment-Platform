import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

import { CheckoutService } from '../../services/checkout.service';
import { MoneyPipe } from '../../pipes/money.pipe';

// The fake payment page used when PAYMENT_PROVIDER is mock. No money, no card.
@Component({
  selector: 'app-mock-pay',
  imports: [CommonModule, MoneyPipe],
  templateUrl: './mock-pay.html',
  styleUrl: './mock-pay.css',
})
export class MockPay implements OnInit {
  intentId = '';
  payment: any = null;
  loading = true;
  paying = false;
  errorMessage = '';

  constructor(private route: ActivatedRoute, private router: Router, private checkoutService: CheckoutService) {}

  ngOnInit() {
    this.intentId = this.route.snapshot.queryParamMap.get('intent') || '';
    this.checkoutService.getIntent(this.intentId).subscribe({
      next: (res) => {
        this.payment = res.data.payment;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.error?.message || 'Payment not found';
        this.loading = false;
      },
    });
  }

  pay() {
    this.paying = true;
    this.checkoutService.mockPay(this.intentId).subscribe({
      next: () => this.router.navigate(['/checkout/result'], { queryParams: { intent: this.intentId } }),
      error: (error) => {
        this.paying = false;
        this.errorMessage = error.error?.message || 'The test payment failed';
      },
    });
  }

  cancel() {
    this.router.navigate(['/checkout/result'], { queryParams: { intent: this.intentId, status: 'cancelled' } });
  }
}
