import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { OrderService } from '../../services/order.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-account-orders',
  imports: [CommonModule, RouterLink, MoneyPipe],
  templateUrl: './account-orders.html',
  styleUrl: './account-orders.css',
})
export class AccountOrders implements OnInit {
  orders: any[] = [];
  loading = true;
  page = 1;
  totalPages = 0;
  openId = '';
  details: Record<string, any> = {};
  imageOf = imageOf;

  constructor(private orderService: OrderService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.orderService.getMyOrders(this.page).subscribe({
      next: (res) => {
        this.orders = res.data.orders;
        this.totalPages = res.data.totalPages;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  goTo(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.page = page;
    this.load();
  }

  toggle(order: any) {
    this.openId = this.openId === order.orderId ? '' : order.orderId;
    if (this.openId && !this.details[order.orderId]) {
      this.orderService.getMyOrder(order.orderId).subscribe({ next: (res) => (this.details[order.orderId] = res.data.order) });
    }
  }
}
