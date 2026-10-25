import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { WishlistService } from '../../services/wishlist.service';
import { ProductCard } from '../../components/product-card/product-card';

@Component({
  selector: 'app-account-wishlist',
  imports: [CommonModule, RouterLink, ProductCard],
  templateUrl: './account-wishlist.html',
  styleUrl: './account-wishlist.css',
})
export class AccountWishlist implements OnInit {
  products: any[] = [];
  loading = true;

  constructor(private wishlistService: WishlistService) {}

  ngOnInit() {
    this.wishlistService.getProducts().subscribe({
      next: (res) => {
        this.products = res.data.wishlist;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });

    // a product disappears from this page when its heart is turned off
    this.wishlistService.ids$.subscribe((ids) => (this.products = this.products.filter((product) => ids.includes(product.id))));
  }
}
