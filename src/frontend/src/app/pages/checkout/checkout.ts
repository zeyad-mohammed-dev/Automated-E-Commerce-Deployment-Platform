import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { CartService } from '../../services/cart.service';
import { CheckoutService } from '../../services/checkout.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-checkout',
  imports: [CommonModule, FormsModule, RouterLink, MoneyPipe],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css',
})
export class Checkout implements OnInit {
  cart: any = null;
  loading = true;

  form = {
    customerName: '',
    customerPhone: '',
    streetAddress: '',
    city: '',
    state: '',
    country: 'Egypt',
    zipCode: '',
  };

  quote: { shipping: number; total: number } | null = null;
  quoting = false;
  paying = false;
  errorMessage = '';
  imageOf = imageOf;

  constructor(
    private authService: AuthService,
    private cartService: CartService,
    private checkoutService: CheckoutService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.cartService.getCart().subscribe({
      next: (res) => {
        this.cart = res.data.cart;
        this.loading = false;
        if (!this.cart.items.length) this.router.navigate(['/cart']);
      },
      error: () => (this.loading = false),
    });

    // fill the form with what we know about the customer
    this.authService.getProfile().subscribe({
      next: (res) => {
        const user = res.data.user;
        this.form.customerName = user.name || '';
        this.form.customerPhone = user.phone || '';
        this.form.streetAddress = user.address?.streetAddress || '';
        this.form.city = user.address?.city || '';
        this.form.state = user.address?.state || '';
        this.form.country = user.address?.country || 'Egypt';
        this.form.zipCode = user.address?.zipCode || '';
        if (this.addressReady) this.updateShipping();
      },
    });
  }

  get shippingAddress() {
    const { streetAddress, city, state, country, zipCode } = this.form;
    return { streetAddress, city, state, country, zipCode };
  }

  get addressReady(): boolean {
    return !!(this.form.streetAddress.trim() && this.form.city.trim() && this.form.country.trim());
  }

  updateShipping() {
    if (!this.addressReady) return;
    this.quoting = true;
    this.errorMessage = '';
    this.checkoutService.quote(this.shippingAddress).subscribe({
      next: (res) => {
        this.quote = res.data.quote;
        this.quoting = false;
      },
      error: (error) => {
        this.quote = null;
        this.quoting = false;
        this.errorMessage = error.error?.message || 'Could not calculate the shipping';
      },
    });
  }

  pay() {
    this.errorMessage = '';
    if (!this.form.customerName.trim() || !this.form.customerPhone.trim() || !this.addressReady) {
      this.errorMessage = 'Please fill in your name, phone and address';
      return;
    }

    this.paying = true;
    this.checkoutService
      .start({ shippingAddress: this.shippingAddress, customerName: this.form.customerName, customerPhone: this.form.customerPhone })
      .subscribe({
        next: (res) => {
          // the payment page (our test page, or Stripe's page)
          window.location.href = res.data.payment.paymentUrl;
        },
        error: (error) => {
          this.paying = false;
          this.errorMessage = error.error?.message || 'Could not start the payment';
        },
      });
  }
}
