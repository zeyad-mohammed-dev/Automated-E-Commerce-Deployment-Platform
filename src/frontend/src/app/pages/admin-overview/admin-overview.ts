import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AdminService } from '../../services/admin.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-admin-overview',
  imports: [CommonModule, FormsModule, RouterLink, MoneyPipe],
  templateUrl: './admin-overview.html',
  styleUrl: './admin-overview.css',
})
export class AdminOverview implements OnInit {
  stats: any = null;
  loading = true;
  errorMessage = '';
  days = 30;
  imageOf = imageOf;
  statuses = ['processing', 'shipped', 'delivered', 'cancelled'];

  constructor(private adminService: AdminService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.errorMessage = '';
    this.adminService.getStats(Number(this.days)).subscribe({
      next: (res) => {
        this.stats = res.data;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error.error?.message || 'Could not load the dashboard';
        this.loading = false;
      },
    });
  }

  get maxRevenue(): number {
    return Math.max(1, ...this.stats.orders.dailySales.map((day: any) => day.revenue));
  }

  barHeight(day: any): number {
    return Math.max(day.revenue > 0 ? 4 : 0, (day.revenue / this.maxRevenue) * 100);
  }

  get totalOrdersInPeriod(): number {
    return this.statuses.reduce((sum, status) => sum + (this.stats.orders.byStatus[status] || 0), 0);
  }

  share(status: string): number {
    const total = this.totalOrdersInPeriod;
    return total ? ((this.stats.orders.byStatus[status] || 0) / total) * 100 : 0;
  }
}
