import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  form = { name: '', email: '', phone: '', password: '', confirmPassword: '' };
  loading = false;
  errorMessage = '';

  constructor(private authService: AuthService, private router: Router) {}

  register() {
    this.errorMessage = '';
    if (this.form.password !== this.form.confirmPassword) {
      this.errorMessage = 'The two passwords are not the same';
      return;
    }

    this.loading = true;
    const { confirmPassword, ...data } = this.form;
    this.authService.register(data).subscribe({
      next: (res) => {
        this.loading = false;
        this.router.navigate(['/verify-email'], { queryParams: { email: res.data.email } });
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Could not create the account';
      },
    });
  }
}
