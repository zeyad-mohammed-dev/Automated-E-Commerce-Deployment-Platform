#!/usr/bin/python
#
# Fake traffic for the Shopora gateway (REST). Use it to demo autoscaling.
# Visitors browse, search and fill a guest cart. Checkout is not included because it needs a
# logged in user with a confirmed email (OTP) and a payment page.
#
#   locust --host=http://$GATEWAY_ADDR --headless -u 10 -r 1
#
# The shop needs some products first (add them from the admin dashboard).

import json
import random
import uuid

from locust import FastHttpUser, TaskSet, between

SEARCH_WORDS = ['shirt', 'shoes', 'watch', 'phone', 'bag', 'mug', 'lamp', 'cap']


def read_json(response):
    try:
        return json.loads(response.text)
    except (ValueError, TypeError):
        return {}


class UserBehavior(TaskSet):

    def on_start(self):
        self.guest_id = uuid.uuid4().hex
        self.product_ids = []
        self.category_slugs = []
        self.load_catalog()

    def load_catalog(self):
        products = read_json(self.client.get('/api/products?limit=50')).get('data', {}).get('products', [])
        self.product_ids = [p['id'] for p in products if p.get('stockQuantity', 0) > 0]
        categories = read_json(self.client.get('/api/categories')).get('data', {}).get('categories', [])
        self.category_slugs = [c['slug'] for c in categories]

    def cart_headers(self):
        return {'x-guest-id': self.guest_id}

    def home(self):
        self.client.get('/api/categories')
        self.client.get('/api/products?sort=bestSelling&limit=5')

    def browse_list(self):
        params = f'?page={random.randint(1, 3)}&limit=12&sort={random.choice(["newest", "priceAsc", "priceDesc"])}'
        if self.category_slugs and random.random() < 0.5:
            params += f'&category={random.choice(self.category_slugs)}'
        self.client.get('/api/products' + params, name='/api/products?[filters]')

    def browse_product(self):
        if self.product_ids:
            self.client.get('/api/products/' + random.choice(self.product_ids), name='/api/products/[id]')

    def search(self):
        self.client.get('/api/search?q=' + random.choice(SEARCH_WORDS), name='/api/search?q=[word]')
        self.client.get('/api/search/suggestions?q=' + random.choice(SEARCH_WORDS)[:3], name='/api/search/suggestions')

    def add_to_cart(self):
        if self.product_ids:
            self.client.post(
                '/api/cart/items',
                json={'productId': random.choice(self.product_ids), 'quantity': random.randint(1, 2)},
                headers=self.cart_headers(),
                name='/api/cart/items',
            )

    def view_cart(self):
        self.client.get('/api/cart', headers=self.cart_headers())

    def empty_cart(self):
        self.client.delete('/api/cart', headers=self.cart_headers())

    tasks = {
        home: 2,
        browse_list: 6,
        browse_product: 10,
        search: 4,
        add_to_cart: 3,
        view_cart: 3,
        empty_cart: 1,
    }


class WebsiteUser(FastHttpUser):
    tasks = [UserBehavior]
    wait_time = between(1, 10)
