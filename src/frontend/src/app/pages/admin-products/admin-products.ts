import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AdminService } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';
import { MoneyPipe } from '../../pipes/money.pipe';
import { imageOf } from '../../pipes/image';

const emptyForm = () => ({ name: '', brand: '', category: '', price: null as number | null, discountPercent: 0, stockQuantity: 0, description: '', rating: 0, reviewCount: 0 });

@Component({
  selector: 'app-admin-products',
  imports: [CommonModule, FormsModule, RouterLink, MoneyPipe],
  templateUrl: './admin-products.html',
  styleUrl: './admin-products.css',
})
export class AdminProducts implements OnInit {
  products: any[] = [];
  categories: any[] = [];
  loading = true;
  page = 1;
  totalPages = 0;
  totalCount = 0;
  q = '';
  categoryFilter = '';

  modalOpen = false;
  editingId = '';
  form = emptyForm();
  existingImages: string[] = [];
  removedImages: string[] = [];
  newFiles: { file: File; url: string }[] = [];
  saving = false;
  errorMessage = '';
  imageOf = imageOf;
  readonly maxImages = 5;

  constructor(private adminService: AdminService, private toastService: ToastService) {}

  ngOnInit() {
    this.adminService.getCategories().subscribe({ next: (res) => (this.categories = res.data.categories) });
    this.load();
  }

  load() {
    this.loading = true;
    this.adminService.getProducts({ q: this.q, category: this.categoryFilter, page: this.page, limit: 10 }).subscribe({
      next: (res) => {
        this.products = res.data.products;
        this.totalPages = res.data.totalPages;
        this.totalCount = res.data.totalCount;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  search() {
    this.page = 1;
    this.load();
  }

  goTo(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.page = page;
    this.load();
  }

  openCreate() {
    this.editingId = '';
    this.form = emptyForm();
    this.existingImages = [];
    this.removedImages = [];
    this.newFiles = [];
    this.errorMessage = '';
    this.modalOpen = true;
  }

  openEdit(product: any) {
    this.editingId = product.id || product._id;
    this.form = {
      name: product.name,
      brand: product.brand || '',
      category: product.category?._id || product.category?.id || '',
      price: product.price,
      discountPercent: product.discountPercent,
      stockQuantity: product.stockQuantity,
      description: product.description || '',
      rating: product.rating,
      reviewCount: product.reviewCount,
    };
    this.existingImages = [...product.images];
    this.removedImages = [];
    this.newFiles = [];
    this.errorMessage = '';
    this.modalOpen = true;
  }

  close() {
    this.newFiles.forEach((item) => URL.revokeObjectURL(item.url));
    this.modalOpen = false;
  }

  get imageCount(): number {
    return this.existingImages.length + this.newFiles.length;
  }

  pickFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    for (const file of Array.from(input.files || [])) {
      if (this.imageCount >= this.maxImages) {
        this.errorMessage = `A product can have up to ${this.maxImages} pictures`;
        break;
      }
      this.newFiles.push({ file, url: URL.createObjectURL(file) });
    }
    input.value = '';
  }

  removeExisting(url: string) {
    this.existingImages = this.existingImages.filter((image) => image !== url);
    this.removedImages.push(url);
  }

  removeNew(index: number) {
    URL.revokeObjectURL(this.newFiles[index].url);
    this.newFiles.splice(index, 1);
  }

  save() {
    this.errorMessage = '';
    if (!this.form.name.trim() || this.form.price === null || !this.form.category) {
      this.errorMessage = 'Name, category and price are required';
      return;
    }

    const body = new FormData();
    for (const [key, value] of Object.entries(this.form)) {
      if (value !== null && value !== undefined) body.append(key, String(value));
    }
    this.newFiles.forEach((item) => body.append('images', item.file));
    if (this.editingId && this.removedImages.length) body.append('removeImages', JSON.stringify(this.removedImages));

    this.saving = true;
    const request = this.editingId ? this.adminService.updateProduct(this.editingId, body) : this.adminService.createProduct(body);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.toastService.success(this.editingId ? 'Product updated' : 'Product added');
        this.close();
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = error.error?.message || 'Could not save the product';
      },
    });
  }

  remove(product: any) {
    if (!confirm(`Delete "${product.name}"? Customers will not see it anymore.`)) return;
    this.adminService.deleteProduct(product.id || product._id).subscribe({
      next: () => {
        this.toastService.success('Product deleted');
        this.load();
      },
      error: (error) => this.toastService.error(error.error?.message || 'Could not delete the product'),
    });
  }
}
