import { Pipe, PipeTransform } from '@angular/core';

const formatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, currency = 'EGP'): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
    return `${currency} ${formatter.format(Number(value))}`;
  }
}
