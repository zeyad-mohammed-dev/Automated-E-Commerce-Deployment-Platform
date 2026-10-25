import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { AdminService } from '../../services/admin.service';
import { ToastService } from '../../services/toast.service';
import { imageOf } from '../../pipes/image';

@Component({
  selector: 'app-admin-categories',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-categories.html',
  styleUrl: './admin-categories.css',
})
export class AdminCategories implements OnInit {
  categories: any[] = [];
  loading = true;

  modalOpen = false;
  editingId = '';
  name = '';
  currentImage = '';
  file: File | null = null;
  preview = '';
  saving = false;
  errorMessage = '';
  imageOf = imageOf;

  constructor(private adminService: AdminService, private toastService: ToastService) {}

  ngOnInit() {
    this.load();
  }

  load() {
    this.adminService.getCategories().subscribe({
      next: (res) => {
        this.categories = res.data.categories;
        this.loading = false;
      },
      error: () => (this.loading = false),
    });
  }

  openCreate() {
    this.editingId = '';
    this.name = '';
    this.currentImage = '';
    this.file = null;
    this.preview = '';
    this.errorMessage = '';
    this.modalOpen = true;
  }

  openEdit(category: any) {
    this.editingId = category._id;
    this.name = category.name;
    this.currentImage = category.image || '';
    this.file = null;
    this.preview = '';
    this.errorMessage = '';
    this.modalOpen = true;
  }

  pickFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (this.preview) URL.revokeObjectURL(this.preview);
    this.file = file;
    this.preview = URL.createObjectURL(file);
  }

  close() {
    if (this.preview) URL.revokeObjectURL(this.preview);
    this.modalOpen = false;
  }

  save() {
    this.errorMessage = '';
    if (!this.name.trim()) {
      this.errorMessage = 'The category needs a name';
      return;
    }

    const body = new FormData();
    body.append('name', this.name.trim());
    if (this.file) body.append('image', this.file);

    this.saving = true;
    const request = this.editingId ? this.adminService.updateCategory(this.editingId, body) : this.adminService.createCategory(body);
    request.subscribe({
      next: () => {
        this.saving = false;
        this.toastService.success(this.editingId ? 'Category updated' : 'Category added');
        this.close();
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage = error.error?.message || 'Could not save the category';
      },
    });
  }

  remove(category: any) {
    if (!confirm(`Delete the category "${category.name}"?`)) return;
    this.adminService.deleteCategory(category._id).subscribe({
      next: () => {
        this.toastService.success('Category deleted');
        this.load();
      },
      error: (error) => this.toastService.error(error.error?.message || 'Could not delete the category'),
    });
  }
}
