import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword {
  step: 'email' | 'reset' = 'email';
  email = '';
  otp = '';
  newPassword = '';
  loading = false;
  errorMessage = '';

  constructor(private authService: AuthService, private toastService: ToastService, private router: Router) {}

  sendCode() {
    this.errorMessage = '';
    this.loading = true;
    this.authService.forgotPassword(this.email).subscribe({
      next: () => {
        this.loading = false;
        this.step = 'reset';
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Could not send the code';
      },
    });
  }

  reset() {
    this.errorMessage = '';
    this.loading = true;
    this.authService.resetPassword({ email: this.email, otp: this.otp.trim(), newPassword: this.newPassword }).subscribe({
      next: () => {
        this.toastService.success('Your password was changed. Please log in.');
        this.router.navigate(['/login']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Could not change the password';
      },
    });
  }
}
