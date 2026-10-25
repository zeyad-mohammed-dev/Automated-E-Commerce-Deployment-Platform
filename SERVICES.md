# Services reference

"Listens on" is the port the process uses inside its container/host.
Original services (cart, checkout, shipping, email, currency, recommendation, ad) use **gRPC**.
The new and rewritten services use **REST (HTTP)**. `productcatalogservice` and `paymentservice` use **both**.
Every Node service has a `src/config/.env.example` with all its variables.

## Ports, health and metrics

| Service | Listens on | Health | Metrics (Prometheus) |
|---|---|---|---|
| frontend | static files (serve `dist/frontend/browser`, send unknown paths to `index.html`) | - | - |
| gateway | `PORT` = 8080 | `GET /health` | `GET /metrics` |
| authservice | `PORT` = 8080 | `GET /health` | `GET /metrics` |
| productcatalogservice | gRPC `PORT` = 3550, REST `HTTP_PORT` = 8080 | REST `GET /health` + gRPC health | REST `GET /metrics` |
| searchservice | `PORT` = 8080 | `GET /health` | `GET /metrics` |
| ordersservice | `PORT` = 8080 | `GET /health` | `GET /metrics` |
| paymentservice | gRPC `PORT` = 50051, REST `HTTP_PORT` = 8080 | REST `GET /health` + gRPC health | REST `GET /metrics` |
| cartservice | 7070 | gRPC health | - |
| checkoutservice | `PORT` = 5050 | gRPC health | - |
| shippingservice | `PORT` = 50051 | gRPC health | - |
| emailservice | `PORT` = 8080 | gRPC health | - |
| currencyservice | `PORT` = 7000 | gRPC health | - |
| recommendationservice | `PORT` = 8080 | gRPC health | - |

All Node services stop gracefully on `SIGTERM` (they finish running requests before exiting), which is what a rolling update needs.
Custom metrics: `orders_created_total`, `orders_status_changes_total`, `payments_intents_total`, `payments_paid_total`,
`payments_charge_total`, `search_catalog_events_total`, `search_indexed_products`, `auth_events_total`,
`gateway_checkout_total`, plus request duration histograms.

## Environment variables

**gateway**: `PORT`, `REDIS_URL`, `JWT_SECRET` (same as authservice), `INTERNAL_API_KEY`, `AUTH_SERVICE_URL`, `CATALOG_SERVICE_URL`,
`SEARCH_SERVICE_URL`, `ORDERS_SERVICE_URL`, `PAYMENT_SERVICE_URL`, `CART_SERVICE_ADDR`, `CHECKOUT_SERVICE_ADDR`, `SHIPPING_SERVICE_ADDR`,
`CURRENCY_SERVICE_ADDR`, `RECOMMENDATION_SERVICE_ADDR`, `STORE_CURRENCY` (EGP).

**authservice**: `PORT`, `DB_URI` (MongoDB), `REDIS_URL`, `JWT_SECRET`, `ACCESS_TOKEN_TTL`, `OTP_TTL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `MAIL_FROM`, `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

**productcatalogservice**: `PORT` (gRPC), `HTTP_PORT`, `DB_URI` (MongoDB), `REDIS_URL`, `STORE_CURRENCY`, `CURRENCY_SERVICE_ADDR`, `CURRENCY_RATE_TTL`,
`STORAGE_DRIVER` (`local` or `s3`), `UPLOAD_DIR`, `S3_BUCKET`, `S3_REGION`, `S3_PUBLIC_BASE_URL`, `INTERNAL_API_KEY`, `CATALOG_EVENTS_CHANNEL`.
With `STORAGE_DRIVER=s3` the AWS credentials come from the normal AWS chain (env vars or the EC2 instance role) and the bucket must allow
public reads (or use a CDN and set `S3_PUBLIC_BASE_URL`). With `local`, the pictures are on the disk of one container, so use `s3` when there is more than one replica.

**searchservice**: `PORT`, `DB_URI` (MongoDB), `REDIS_URL`, `CATALOG_SERVICE_URL`, `INTERNAL_API_KEY`, `SYNC_INTERVAL_SECONDS`, `CATALOG_EVENTS_CHANNEL`.

**ordersservice**: `PORT`, `DATABASE_URL` (`postgresql://user:pass@host:5432/orders`, no `+psycopg2` anymore), `DATABASE_SSL` (`true` for RDS),
`CATALOG_SERVICE_URL`, `INTERNAL_API_KEY`. Tables are created at startup.

**paymentservice**: `PORT` (gRPC), `HTTP_PORT`, `REDIS_URL`, `INTERNAL_API_KEY`, `PAYMENT_PROVIDER` (`mock` or `stripe`), `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_API_BASE`, `FRONTEND_URL`, `PAID_CALLBACK_URL` (gateway: `http://gateway:8080/internal/payments/paid`), `INTENT_TTL`.

**checkoutservice** (not changed): `PRODUCT_CATALOG_SERVICE_ADDR`, `SHIPPING_SERVICE_ADDR`, `PAYMENT_SERVICE_ADDR`, `EMAIL_SERVICE_ADDR`,
`CURRENCY_SERVICE_ADDR`, `CART_SERVICE_ADDR`, `ORDERS_SERVICE_ADDR` (`ordersservice:8080`, optional but needed for order history).

**cartservice** (not changed): `REDIS_ADDR`. **loadgenerator**: run `locust --host=http://<gateway>`.

`INTERNAL_API_KEY` must have the same value in gateway, productcatalogservice, searchservice, ordersservice and paymentservice.
`JWT_SECRET` must be the same in gateway and authservice. Both are secrets (use a secret store, not plain files).

## Who calls whom

```
browser   -> gateway (everything: /api/*, /uploads/*), and Stripe -> paymentservice /api/payments/webhook
gateway   -> authservice, productcatalogservice (REST), searchservice, ordersservice, paymentservice (REST)
gateway   -> cartservice, shippingservice, currencyservice, recommendationservice, checkoutservice (gRPC)
gateway   -> Redis (token revocation, checkout lock)
checkout  -> productcatalog (gRPC), shipping, payment (gRPC Charge), email, currency, cart, ordersservice (POST /api/orders)
productcatalog -> currencyservice (gRPC, for the EGP -> USD rate), Redis (publishes product events), MongoDB, S3
searchservice  -> Redis (subscribes to product events), productcatalogservice (REST, first sync + every 5 minutes), MongoDB
ordersservice  -> PostgreSQL, productcatalogservice (REST: product names, stock update)
paymentservice -> Redis, Stripe (when PAYMENT_PROVIDER=stripe), gateway (callback when a payment is confirmed)
authservice    -> MongoDB, Redis, SMTP
recommendation -> productcatalog (gRPC)
cart -> Redis
```

Which service must be reachable from the internet: the **gateway** and the **frontend** (usually behind one Nginx: `/` -> frontend,
`/api` and `/uploads` -> gateway) and, only with Stripe, `POST /api/payments/webhook` of paymentservice.
`ordersservice` accepts `POST /api/orders` **without a key** because checkoutservice (Go, not changed) sends no header.
Keep ordersservice, catalog, search, auth and payment (except the webhook) inside the private network.

## Docker

Every service has a `Dockerfile` and `.dockerignore` in its folder (`adservice` is not used by the new website, so it has none), and the root
`compose.yaml` runs all of them with the databases. See the README and [DOCKER_GUIDE.md](DOCKER_GUIDE.md).

| Service | Image recipe |
|---|---|
| Node services (gateway, authservice, productcatalogservice, searchservice, ordersservice, paymentservice, currencyservice) | `node:22-alpine`, `npm ci --omit=dev`, user `node` |
| frontend | multi-stage: Node builds Angular, `nginx-unprivileged` serves it and routes `/api` and `/uploads` to the gateway |
| checkoutservice, shippingservice | multi-stage: `golang:1.27-alpine` builds, `alpine` runs |
| cartservice | multi-stage: .NET 10 SDK builds, ASP.NET 10 runtime runs |
| emailservice, recommendationservice | `python:3.12-slim`, `pip install -r requirements.txt`, user `appuser` |
| loadgenerator | not in compose, run Locust from your machine: `locust --host=http://localhost:8080` |

Things to know when deploying:
- The frontend calls relative urls (`/api/...`, `/uploads/...`), so put it and the gateway behind the same host name.
- `proto/` folders inside the Node services are copies of `protos/` (so a service builds from its own folder).
- Databases: MongoDB (auth, catalog, search; they use different database names), PostgreSQL (orders, this is the RDS part), Redis (cart, tokens, OTP, payments, events).
  The Mongo code uses only standard operators, so it also runs on DocumentDB.
- Redis pub/sub messages are not stored. Search heals itself with a full sync every 5 minutes.
- Product pictures: use `STORAGE_DRIVER=s3` in production.

## APIs

**gateway** (what the frontend uses; answers look like `{ success, message, data }`)
- Public: `GET /api/products`, `/api/products/:id`, `/api/categories`, `/api/search`, `/api/search/suggestions`, `GET /api/track?orderId=|trackingId=&email=`
- Auth (forwarded to authservice): `POST /api/auth/register | confirm-email | resend-otp | login | forgot-password | reset-password | logout`, `/api/users/me...`
- Cart (guest with header `x-guest-id`, or logged in): `GET/DELETE /api/cart`, `POST /api/cart/items`, `PATCH/DELETE /api/cart/items/:productId`, `POST /api/cart/merge`
- Logged in: `/api/wishlist`, `/api/orders`, `POST /api/checkout/quote | start | confirm`, `GET /api/checkout/intent/:id`, `POST /api/checkout/mock-pay/:id`
- Admin: `GET /api/admin/stats`, `/api/admin/products`, `/api/admin/categories`, `/api/admin/orders`, `/api/admin/users`
- Internal: `POST /internal/payments/paid` (needs `x-internal-key`)

**productcatalogservice REST**: `GET /api/products?q=&category=&minPrice=&maxPrice=&onSale=&inStock=&sort=&page=&limit=`, `GET /api/products/:id`,
`GET /api/categories`; with the internal key: `POST/PATCH/DELETE /api/products` and `/api/categories` (multipart, pictures in the field `images`),
`GET /api/products/export`, `POST /api/products/stock/adjust`.

**searchservice**: `GET /api/search?q=&category=&minPrice=&maxPrice=&onSale=&inStock=&sort=&page=&limit=`, `GET /api/search/suggestions?q=`.

**ordersservice**: `POST /api/orders` (the body checkoutservice sends: `order_id, user_id, email, tracking_id, currency, total, items:[{product_id, quantity}]`),
`GET /api/orders?userId=&status=&q=&from=&to=&page=&limit=`, `GET /api/orders/:id`, `GET /api/orders/track`, `GET /api/orders/stats?days=`,
`PATCH /api/orders/:id/status` (`processing -> shipped -> delivered`, or `cancelled`, a cancel gives the stock back), `PATCH /api/orders/:id/details`.
Everything except `POST /api/orders` needs the internal key when `INTERNAL_API_KEY` is set.

**paymentservice**: `POST /api/payments/intents`, `GET /api/payments/intents/:id[?refresh=true]`, `POST /api/payments/intents/:id/order`,
`POST /api/payments/intents/:id/mock-pay` (mock mode only), `POST /api/payments/webhook` (Stripe, checked with the signature).

## Tests

```bash
cd src/<service> && npm test
```

| Service | Tests | Needs |
|---|---|---|
| authservice | validators, OTP, full register / login / logout / reset / admin flow | MongoDB, Redis |
| productcatalogservice | money, models, gRPC, REST, uploads, stock, events | MongoDB, Redis |
| searchservice | query builder, sync, event handling | (unit only; the DB parts were checked by hand) |
| ordersservice | body rules, full API | PostgreSQL |
| paymentservice | Stripe form and signature, intents, webhook, Charge, mock mode | Redis |
| gateway | everything with fake services | Redis |

The original cartservice, shippingservice and checkoutservice keep their own tests (`dotnet test`, `go test ./...`).
