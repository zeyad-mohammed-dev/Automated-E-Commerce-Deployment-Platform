import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-account-security',
  imports: [CommonModule, FormsModule],
  templateUrl: './account-security.html',
  styleUrl: './account-security.css',
})
export class AccountSecurity {
  oldPassword = '';
  newPassword = '';
  confirmPassword = '';
  saving = false;
  errorMessage = '';

  constructor(private authService: AuthService, private toastService: ToastService) {}

  save() {
    this.errorMessage = '';
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'The two passwords are not the same';
      return;
    }

    this.saving = true;
    this.authService.changePassword({ oldPassword: this.oldPassword, newPassword: this.newPassword }).subscribe({
      next: () => {
        this.saving = false;
        this.oldPassword = this.newPassword = this.confirmPassword = '';
        this.toastService.success('Password changed. Other devices were logged out.');
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = error.error?.message || 'Could not change the password';
      },
    });
  }
}
