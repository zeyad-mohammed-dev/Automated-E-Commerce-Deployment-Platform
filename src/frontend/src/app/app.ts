import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { Navbar } from './components/navbar/navbar';
import { Footer } from './components/footer/footer';
import { Toast } from './components/toast/toast';
import { CartService } from './services/cart.service';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, Navbar, Footer, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  isAdminArea = false;

  constructor(private router: Router, private cartService: CartService, private authService: AuthService) {}

  ngOnInit() {
    this.cartService.refreshCount();
    // refresh the saved user (role, name) in the background
    if (this.authService.isLoggedIn()) this.authService.getProfile().subscribe({ error: () => {} });

    this.isAdminArea = this.router.url.startsWith('/admin');
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: any) => (this.isAdminArea = event.urlAfterRedirects.startsWith('/admin')));
  }
}
