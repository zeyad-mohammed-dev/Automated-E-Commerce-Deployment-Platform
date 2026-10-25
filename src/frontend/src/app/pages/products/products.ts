import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { ProductService } from '../../services/product.service';
import { ProductCard } from '../../components/product-card/product-card';

@Component({
  selector: 'app-products',
  imports: [CommonModule, FormsModule, ProductCard],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products implements OnInit {
  products: any[] = [];
  categories: any[] = [];
  loading = true;
  errorMessage = '';

  totalCount = 0;
  totalPages = 0;
  page = 1;

  // the filters, they are saved in the url so the page can be shared and the back button works
  q = '';
  category = '';
  onSale = false;
  inStock = false;
  sort = '';
  minPrice: number | null = null;
  maxPrice: number | null = null;

  sorts = [
    { value: '', label: 'Best match' },
    { value: 'newest', label: 'Newest' },
    { value: 'bestSelling', label: 'Best selling' },
    { value: 'priceAsc', label: 'Price: low to high' },
    { value: 'priceDesc', label: 'Price: high to low' },
    { value: 'rating', label: 'Top rated' },
  ];

  constructor(private productService: ProductService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.productService.getCategories().subscribe({ next: (res) => (this.categories = res.data.categories) });

    this.route.queryParams.subscribe((params) => {
      this.q = params['q'] || '';
      this.category = params['category'] || '';
      this.onSale = params['onSale'] === 'true';
      this.inStock = params['inStock'] === 'true';
      this.sort = params['sort'] || '';
      this.minPrice = params['minPrice'] ? Number(params['minPrice']) : null;
      this.maxPrice = params['maxPrice'] ? Number(params['maxPrice']) : null;
      this.page = Number(params['page']) || 1;
      this.load();
    });
  }

  get title(): string {
    if (this.q) return `Results for "${this.q}"`;
    if (this.onSale) return 'Deals';
    if (this.sort === 'newest' && !this.category) return 'New Arrivals';
    if (this.category) return this.categories.find((item) => item.slug === this.category)?.name || 'Products';
    return 'All products';
  }

  private query(): Record<string, any> {
    return {
      q: this.q,
      category: this.category,
      onSale: this.onSale ? 'true' : '',
      inStock: this.inStock ? 'true' : '',
      sort: this.sort,
      minPrice: this.minPrice ?? '',
      maxPrice: this.maxPrice ?? '',
      page: this.page > 1 ? this.page : '',
    };
  }

  load() {
    this.loading = true;
    this.errorMessage = '';
    const query = { ...this.query(), limit: 12, page: this.page };
    // a text search is ranked by the search service, a plain list comes from the catalog
    const request = this.q ? this.productService.search(query) : this.productService.getProducts(query);

    request.subscribe({
      next: (res: any) => {
        this.products = res.data.results || res.data.products || [];
        this.totalCount = res.data.totalCount;
        this.totalPages = res.data.totalPages;
        this.loading = false;
      },
      error: (error: any) => {
        this.errorMessage = error.error?.message || 'Could not load the products';
        this.loading = false;
      },
    });
  }

  apply(reset = true) {
    if (reset) this.page = 1;
    const queryParams: Record<string, any> = {};
    for (const [key, value] of Object.entries(this.query())) if (value !== '' && value !== null) queryParams[key] = value;
    this.router.navigate(['/products'], { queryParams });
  }

  clear() {
    this.router.navigate(['/products']);
  }

  goTo(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.page = page;
    this.apply(false);
  }

  get pages(): number[] {
    const first = Math.max(1, this.page - 2);
    const last = Math.min(this.totalPages, first + 4);
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }
}
