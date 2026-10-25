import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { ProductService } from '../../services/product.service';
import { CartService } from '../../services/cart.service';
import { WishlistService } from '../../services/wishlist.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { ProductCard } from '../../components/product-card/product-card';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-product-details',
  imports: [CommonModule, RouterLink, ProductCard, MoneyPipe],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css',
})
export class ProductDetails implements OnInit {
  product: any = null;
  related: any[] = [];
  loading = true;
  notFound = false;
  selectedImage = 0;
  quantity = 1;
  adding = false;
  imageOf = imageOf;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private productService: ProductService,
    private cartService: CartService,
    public wishlistService: WishlistService,
    private authService: AuthService,
    private toastService: ToastService,
    private title: Title,
  ) {}

  ngOnInit() {
    this.route.paramMap.subscribe((params) => this.load(params.get('id') || ''));
  }

  load(id: string) {
    this.loading = true;
    this.notFound = false;
    this.selectedImage = 0;
    this.quantity = 1;
    this.productService.getProduct(id).subscribe({
      next: (res) => {
        this.product = res.data.product;
        this.related = res.data.related || [];
        this.title.setTitle(`${this.product.name} | Shopora`);
        this.loading = false;
      },
      error: () => {
        this.notFound = true;
        this.loading = false;
      },
    });
  }

  get id(): string {
    return this.product.id || this.product._id;
  }

  get isFavorite(): boolean {
    return this.wishlistService.has(this.id);
  }

  changeQuantity(step: number) {
    const next = this.quantity + step;
    if (next >= 1 && next <= Math.min(this.product.stockQuantity, 99)) this.quantity = next;
  }

  addToCart(goToCart = false) {
    this.adding = true;
    this.cartService.add(this.id, this.quantity).subscribe({
      next: () => {
        this.adding = false;
        if (goToCart) this.router.navigate(['/cart']);
        else this.toastService.success('Added to your cart');
      },
      error: (error) => {
        this.adding = false;
        this.toastService.error(error.error?.message || 'Could not add to the cart');
      },
    });
  }

  toggleFavorite() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.wishlistService.toggle(this.id).subscribe({
      error: (error) => this.toastService.error(error.error?.message || 'Could not update the wishlist'),
    });
  }
}
