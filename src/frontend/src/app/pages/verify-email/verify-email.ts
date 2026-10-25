import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-verify-email',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './verify-email.html',
  styleUrl: './verify-email.css',
})
export class VerifyEmail implements OnInit, OnDestroy {
  email = '';
  otp = '';
  loading = false;
  errorMessage = '';
  cooldown = 45;
  private timer: any;

  constructor(
    private authService: AuthService,
    private toastService: ToastService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    this.email = this.route.snapshot.queryParamMap.get('email') || '';
    this.startCooldown();
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  private startCooldown() {
    clearInterval(this.timer);
    this.cooldown = 45;
    this.timer = setInterval(() => {
      this.cooldown--;
      if (this.cooldown <= 0) clearInterval(this.timer);
    }, 1000);
  }

  confirm() {
    this.errorMessage = '';
    this.loading = true;
    this.authService.confirmEmail({ email: this.email, otp: this.otp.trim() }).subscribe({
      next: () => {
        this.loading = false;
        this.toastService.success('Your email is confirmed. Welcome to Shopora!');
        this.router.navigate(['/']);
      },
      error: (error) => {
        this.loading = false;
        this.errorMessage = error.error?.message || 'Could not confirm the email';
      },
    });
  }

  resend() {
    if (this.cooldown > 0) return;
    this.authService.resendOtp(this.email).subscribe({
      next: () => {
        this.toastService.success('If the account exists, a new code is on its way');
        this.startCooldown();
      },
      error: (error) => (this.errorMessage = error.error?.message || 'Could not send a new code'),
    });
  }
}
