import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-admin-customers',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-customers.html',
  styleUrl: './admin-customers.css',
})
export class AdminCustomers implements OnInit {
  users: any[] = [];
  loading = true;
  page = 1;
  totalPages = 0;
  totalCount = 0;
  q = '';
  role = '';

  constructor(private adminService: AdminService, private toastService: ToastService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.adminService.getUsers({ q: this.q, role: this.role, page: this.page, limit: 15 }).subscribe({
      next: (res) => {
        this.users = res.data.users;
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

  toggleBan(user: any) {
    const suspend = !user.isBanned;
    if (suspend && !confirm(`Suspend ${user.name}? They will be logged out and can not log in.`)) return;
    this.adminService.setBanned(user.id, suspend).subscribe({
      next: () => {
        this.toastService.success(suspend ? 'Customer suspended' : 'Customer activated');
        this.load();
      },
      error: (error) => this.toastService.error(error.error?.message || 'Could not update the customer'),
    });
  }
}
