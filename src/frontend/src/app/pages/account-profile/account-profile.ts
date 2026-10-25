import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-account-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './account-profile.html',
  styleUrl: './account-profile.css',
})
export class AccountProfile implements OnInit {
  form = { name: '', phone: '', streetAddress: '', city: '', state: '', country: 'Egypt', zipCode: '' };
  email = '';
  loading = true;
  saving = false;
  errorMessage = '';

  constructor(private authService: AuthService, private toastService: ToastService) {}

  ngOnInit() {
    this.authService.getProfile().subscribe({
      next: (res) => {
        const user = res.data.user;
        this.email = user.email;
        this.form = {
          name: user.name || '',
          phone: user.phone || '',
          streetAddress: user.address?.streetAddress || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          country: user.address?.country || 'Egypt',
          zipCode: user.address?.zipCode || '',
        };
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  save() {
    this.errorMessage = '';
    this.saving = true;
    const { name, phone, ...address } = this.form;
    this.authService.updateProfile({ name, phone, address }).subscribe({
      next: () => {
        this.saving = false;
        this.toastService.success('Profile saved');
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = error.error?.message || 'Could not save the profile';
      },
    });
  }
}
