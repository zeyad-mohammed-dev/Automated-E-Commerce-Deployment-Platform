import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

// what an admin can do next, the same rules as ordersservice
const nextSteps: Record<string, { status: string; label: string; danger?: boolean }[]> = {
  processing: [{ status: 'shipped', label: 'Mark as shipped' }, { status: 'cancelled', label: 'Cancel order', danger: true }],
  shipped: [{ status: 'delivered', label: 'Mark as delivered' }, { status: 'cancelled', label: 'Cancel order', danger: true }],
  delivered: [],
  cancelled: [],
};

@Component({
  selector: 'app-admin-orders',
  imports: [CommonModule, FormsModule, MoneyPipe],
  templateUrl: './admin-orders.html',
  styleUrl: './admin-orders.css',
})
export class AdminOrders implements OnInit {
  orders: any[] = [];
  loading = true;
  page = 1;
  totalPages = 0;
  totalCount = 0;
  status = '';
  q = '';

  selected: any = null;
  note = '';
  updating = false;
  imageOf = imageOf;

  constructor(private adminService: AdminService, private toastService: ToastService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.adminService.getOrders({ status: this.status, q: this.q, page: this.page, limit: 10 }).subscribe({
      next: (res) => {
        this.orders = res.data.orders;
        this.totalPages = res.data.totalPages;
        this.totalCount = res.data.totalCount;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  search() {
    this.page = 1;
    this.load();
  }

  goTo(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.page = page;
    this.load();
  }

  open(order: any) {
    this.note = '';
    this.selected = order;
    this.adminService.getOrder(order.orderId).subscribe({ next: (res) => (this.selected = res.data.order) });
  }

  close() {
    this.selected = null;
  }

  stepsFor(order: any) {
    return nextSteps[order.status] || [];
  }

  change(status: string) {
    if (status === 'cancelled' && !confirm('Cancel this order? The items go back to the stock.')) return;
    this.updating = true;
    this.adminService.updateOrderStatus(this.selected.orderId, status, this.note.trim() || undefined).subscribe({
      next: (res) => {
        this.updating = false;
        this.selected = res.data.order;
        this.note = '';
        this.toastService.success(`Order is now ${status}`);
        this.load();
      },
      error: (error) => {
        this.updating = false;
        this.toastService.error(error.error?.message || 'Could not change the status');
      },
    });
  }
}
