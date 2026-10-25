import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import { ProductService } from '../../services/product.service';
import { ProductCard } from '../../components/product-card/product-card';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-home',
  imports: [CommonModule, RouterLink, ProductCard],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit, OnDestroy {
  slides = [
    { title: 'New Season', strong: 'New You', text: 'Trendy styles for every occasion.', button: 'Discover Now', link: '/products', query: { sort: 'newest' }, theme: 'one' },
    { title: 'Hot Deals', strong: 'Handpicked', text: 'Great prices on products people love.', button: 'See Deals', link: '/products', query: { onSale: 'true' }, theme: 'two' },
    { title: 'Find Your', strong: 'Favorites', text: 'Browse the store by category.', button: 'Shop Categories', link: '/categories', query: {}, theme: 'three' },
  ];
  current = 0;
  private timer: any;

  categories: any[] = [];
  trending: any[] = [];
  newArrivals: any[] = [];
  deals: any[] = [];
  loading = true;
  imageOf = imageOf;

  constructor(private productService: ProductService) {}

  ngOnInit() {
    this.timer = setInterval(() => this.next(), 5500);

    this.productService.getCategories().subscribe({ next: (res) => (this.categories = res.data.categories.slice(0, 5)) });
    this.productService.getProducts({ sort: 'bestSelling', limit: 5 }).subscribe({
      next: (res) => {
        this.trending = res.data.products;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
    this.productService.getProducts({ sort: 'newest', limit: 5 }).subscribe({ next: (res) => (this.newArrivals = res.data.products) });
    this.productService.getProducts({ onSale: 'true', limit: 5 }).subscribe({ next: (res) => (this.deals = res.data.products) });
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  next() {
    this.current = (this.current + 1) % this.slides.length;
  }

  previous() {
    this.current = (this.current - 1 + this.slides.length) % this.slides.length;
  }

  go(index: number) {
    this.current = index;
  }
}
