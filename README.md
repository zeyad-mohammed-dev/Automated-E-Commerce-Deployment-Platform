# Shopora: e-commerce microservices (base for the DevOps project)

An online store built from small services. This repository contains the application source code and a Docker Compose setup for local development. The DevOps team will extend the deployment workflow with infrastructure as code (Terraform), CI/CD, cloud deployment, and monitoring.

```
                         Browser (Angular, src/frontend)
                                      |
                                  /api, /uploads
                                      |
                               gateway (Node, REST)
        ______________________________|______________________________________
       |          |            |            |             |                 |
   authservice  catalog     search       orders        payment           gRPC services
   (Mongo,      (Mongo,     (Mongo,      (PostgreSQL)  (Redis,           cart -> Redis
    Redis)       gRPC+REST)  Redis sub)                  Stripe test)     checkout, shipping,
                    |  ^                                                  email, currency,
                    |  '--- Redis pub/sub: product changes -> search       recommendation, ad
                    '--- gRPC (same contract as before) for cart, checkout, recommendation
```

## Services

| Service | Language | Data | Role |
|---|---|---|---|
| **frontend** (new) | Angular 20 | - | Shopora store + admin dashboard (static files) |
| **gateway** (new) | Node.js | Redis | REST for the frontend. Talks gRPC to the original services, checks login tokens |
| **authservice** (new) | Node.js | MongoDB, Redis | register, OTP email (nodemailer), login, logout, profile, wishlist, users (admin) |
| **productcatalogservice** (new) | Node.js | MongoDB | products and categories. gRPC with the **same contract** as before + REST for the dashboard |
| **searchservice** (new) | Node.js | MongoDB | search and suggestions. Keeps its own copy of the products, updated through Redis pub/sub |
| **ordersservice** (new) | Node.js | PostgreSQL (RDS) | orders, status history, tracking, dashboard numbers |
| **paymentservice** (new) | Node.js | Redis | test payments: a built in **mock** page, or **Stripe** in test mode |
| cartservice | C# | Redis | cart (not changed) |
| checkoutservice | Go | - | places the order (not changed) |
| shippingservice | Go | - | shipping quote + tracking id (not changed) |
| emailservice | Python | - | order confirmation mail (not changed) |
| currencyservice | Node.js | JSON file | currency conversion (only change: `EGP` was added to `data/currency_conversion.json`) |
| recommendationservice | Python | - | related products (not changed) |
| adservice | Java | - | ads (not changed, the new frontend does not show them) |
| loadgenerator | Python (Locust) | - | fake traffic against the gateway |
| Redis, MongoDB, PostgreSQL | - | - | needed by the services above |

The store works in **EGP**. Prices are saved in EGP. The gRPC contract of the catalog still returns
`price_usd` (so cart, checkout and recommendation did not change), converted with the rate of `currencyservice`.

The shop starts **empty**. Log in as the admin (see below) and add categories and products from the dashboard.

## How an order is made

1. The customer fills the cart (guests keep it under a random id, it moves to the account after login).
2. Checkout: the gateway prices the cart, asks `shippingservice` for the shipping, and creates a **payment**
   in `paymentservice`. The browser goes to the payment page (our mock page, or Stripe Checkout).
3. When the payment is confirmed (Stripe webhook, polling, or the mock button), `paymentservice` tells the gateway.
4. The gateway calls `checkoutservice.PlaceOrder`. Checkout still calls `paymentservice.Charge` with a "credit card".
   The **card number field now carries the payment id**. `Charge` only checks that this payment is paid, for the same
   amount, and that it was not used before. Then checkout ships, sends the mail, empties the cart and
   records the order in `ordersservice`.
5. The gateway adds address and payment info to the order. One payment can create one order only.

## Run everything with Docker (easiest)

Needs Docker with Compose. Every service used by the Compose stack has a `Dockerfile`, and `compose.yaml` starts the whole store
(16 containers: 3 databases, the application services, and the website). The unused legacy `adservice` is not part of this stack.

```bash
cp .env.example .env            # then open .env and change the secrets and the admin email/password
docker compose up -d --build    # first time takes a few minutes
```

Open http://localhost:8080 and log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`.
Only the website has a port open to your machine, everything else stays inside the private network `shopora-network`.
Stop with `docker compose down` (add `-v` to delete the data too). A step by step explanation (in Arabic)
is in [DOCKER_GUIDE.md](DOCKER_GUIDE.md).

Note: the images of the Go and .NET services and the full `docker compose up` were written following the official images
but could not be built in the environment where this was made (no Docker there). The compose file, the Dockerfiles (hadolint),
the Nginx config and the Node and Python start up steps were checked.

## Run it on a developer machine (without containers)

You need Node.js 22, MongoDB, Redis and PostgreSQL. The original gRPC services (cart, checkout, shipping, currency,
email, recommendation) must run too, see their folders. Each Node service reads `src/config/.env.dev`
(copy it from `src/config/.env.example`, every variable is explained there).

```bash
# in every Node service folder (authservice, productcatalogservice, searchservice, ordersservice, paymentservice, gateway)
npm install
cp src/config/.env.example src/config/.env.dev   # then edit
npm run dev

# the website
cd src/frontend && npm install && npm start       # http://localhost:4200, /api goes to the gateway on :8080
```

The first admin account is created by `authservice` at startup from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
OTP emails need SMTP settings. Without `SMTP_HOST` the code is printed in the authservice log.

Payments: `PAYMENT_PROVIDER=mock` (default) needs nothing. For Stripe test mode set `PAYMENT_PROVIDER=stripe`,
`STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...` (use `stripe listen --forward-to localhost:8080/api/payments/webhook`
in development). Use the test card `4242 4242 4242 4242`. Check in your Stripe account that EGP can be charged.

## Tests

```bash
cd src/<service> && npm test        # authservice, productcatalogservice, searchservice, ordersservice, paymentservice, gateway
cd src/frontend && npx ng build     # compiles the website
```

Some tests need a database: MongoDB (or a compatible server), Redis, and PostgreSQL for `ordersservice`.
They connect to `127.0.0.1` by default. Use `TEST_DB_URI`, `TEST_REDIS_URL` and `TEST_DATABASE_URL` to change that.

More details (ports, environment variables, APIs, notes for deployment) are in [SERVICES.md](SERVICES.md).
