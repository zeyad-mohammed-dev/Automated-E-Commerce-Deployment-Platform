import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  email = '';
  password = '';
  loading = false;
  errorMessage = '';
  needsConfirm = false;

  constructor(private authService: AuthService, private router: Router, private route: ActivatedRoute) {}

  login() {
    this.errorMessage = '';
    this.needsConfirm = false;
    this.loading = true;

    this.authService.login({ email: this.email, password: this.password }).subscribe({
      next: (res) => {
        this.loading = false;
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl && returnUrl.startsWith('/')) this.router.navigateByUrl(returnUrl);
        else this.router.navigate([res.data.user.role === 'admin' ? '/admin' : '/']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Could not log in';
        this.needsConfirm = error.status === 403 && /confirm/i.test(this.errorMessage);
      },
    });
  }

  confirmEmail() {
    this.authService.resendOtp(this.email).subscribe({
      next: () => this.router.navigate(['/verify-email'], { queryParams: { email: this.email } }),
      error: () => this.router.navigate(['/verify-email'], { queryParams: { email: this.email } }),
    });
  }
}
