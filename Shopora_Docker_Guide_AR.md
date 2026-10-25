# دليل Docker لمشروع Shopora

الملف ده بيوثّق إعداد Docker الموجود في مشروع Shopora، وبيشرح طريقة تجهيز المشروع وتشغيله ومتابعة حالته وحل المشاكل الشائعة.

الدليل بيغطي ملفات Dockerfile، وإعداد Docker Compose، والـNetworks، والـVolumes، وأوامر التشغيل والتشخيص، مع أمثلة من ملفات المشروع.

**نطاق الدليل:** الهدف هو توضيح إعدادات Docker الموجودة في المشروع وطريقة استخدامها، مش شرح Docker من البداية أو تلخيص محاضرة معينة.

**حالة الاختبارات:** أي جزء لسه متجربش فعليًا لازم يفضل موضّح إنه محتاج اختبار، عشان نفرّق بين الإعدادات المكتوبة والوظائف اللي اتأكدنا إنها شغالة.

---

## 1. الفكرة في دقيقة

المحاضرة قالت:

```
Source Code  →  Dockerfile  →  docker build  →  Image  →  docker run  →  Container
```

في مشروعنا:

- كل service ليها Dockerfile (وصفة بتحول الكود لـ Image).
- ملف واحد اسمه compose.yaml بيشغّل كل الـ Containers مع بعض (الـ services والـ databases).
- أمر واحد بيشغّل المتجر كله:

```bash
docker compose up -d --build
```

---

## 2. إيه اللي اتضاف

| الملف | بيعمل إيه |
|---|---|
| compose.yaml | بيشغّل المتجر كله (16 container) ويربطهم ببعض |
| .env.example | الإعدادات والأسرار (بتنسخه لـ .env وتغيّر القيم) |
| src/<service>/Dockerfile | وصفة بناء الـ Image لكل service (13 ملف) |
| src/<service>/.dockerignore | الملفات اللي Docker مياخدهاش جوه الـ Image |
| src/frontend/nginx.conf | إعداد Nginx اللي بيقدّم الموقع وبيوجّه الـ API |

الـ services اللي ليها Dockerfile:

| النوع | الـ services |
|---|---|
| Node.js (الجديدة) | gateway, authservice, productcatalogservice, searchservice, ordersservice, paymentservice |
| Node.js (الأصلية) | currencyservice |
| Python | emailservice, recommendationservice |
| Go | checkoutservice, shippingservice |
| C# (.NET) | cartservice |
| Angular + Nginx | frontend |

الـ adservice (Java) ملهاش Dockerfile ومش في الـ compose، لأن الموقع الجديد مبيعرضش إعلانات والـ gateway مبينادي عليها.

---

## 3. تشغيل المشروع

لازم يكون عندك Docker Desktop (أو Docker Engine) شغال.

### الخطوة 1: جهّز ملف الإعدادات

```bash
cp .env.example .env
```

افتح ملف .env وغيّر القيم دي على الأقل:

- JWT_SECRET و INTERNAL_API_KEY و POSTGRES_PASSWORD: اكتب فيهم أي نص طويل عشوائي.
- ADMIN_EMAIL و ADMIN_PASSWORD: ده الأدمن اللي هتدخل بيه الـ dashboard.

إذا كانت قيمة مطلوبة ومتحقق منها باستخدام صيغة الإلزام في Compose غير موجودة، فقد يرفض Compose تحميل الإعدادات ويعرض اسم المتغير الناقص.

### الخطوة 2: شغّل

```bash
docker compose up -d --build
```

- up بيشغّل.
- d معناها في الخلفية (detached).
- build بيبني الـ Images الأول. أول مرة هتاخد وقت (بيحمّل ويبني 13 image)، وبعد كده بتبقى أسرع بسبب الـ cache.

### الخطوة 3: افتح الموقع

```
http://localhost:8080
```

- دخول الأدمن: من صفحة Log in بالإيميل والباسورد اللي في .env، وبعدها هتلاقي Dashboard في القايمة.
- المتجر بيبدأ فاضي. من الـ Dashboard ضيف Category الأول وبعدها المنتجات.
- الدفع: الوضع الافتراضي mock (صفحة دفع تجريبية، من غير فلوس ولا كارت).
- لما تعمل حساب جديد، كود الـ OTP بيتطبع في اللوج (لأن مفيش SMTP):

```bash
docker compose logs authservice
```

### الخطوة 4: إيقاف المشروع

```bash
docker compose down        # بيوقف ويمسح الـ containers، والداتا بتفضل
docker compose down -v     # بيمسح كل حاجة بما فيها الداتا (المنتجات والطلبات والحسابات)
```

---

## 4. شرح الـ Dockerfile سطر بسطر

ده Dockerfile بتاع الـ gateway (باقي الـ services الجديدة نفس الشكل بالظبط):

```dockerfile
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node

EXPOSE 8080

CMD ["node", "index.js"]
```

| السطر | معناه (زي المحاضرة) |
|---|---|
| FROM node:22-alpine | الـ Image الأساسية. Node.js 22 على Alpine (نسخة صغيرة جدًا) |
| ENV NODE_ENV=production | متغير بيخلي Node يشتغل في وضع الـ production |
| WORKDIR /app | كل الأوامر اللي بعد كده بتشتغل جوه فولدر /app |
| COPY package*.json ./ | بننسخ ملفات المكتبات بس (ملف package.json و package-lock.json) |
| RUN npm ci --omit=dev | بينزّل المكتبات وقت البناء (من غير أدوات التطوير زي nodemon) |
| COPY . . | بعد كده ننسخ باقي الكود |
| USER node | بنشتغل بيوزر عادي مش root |
| EXPOSE 8080 | بنوثّق إن الـ service بتسمع على بورت 8080 |
| CMD ["node", "index.js"] | الأمر اللي بيشغّل الـ service لما الـ container يقوم |

نقطة المحاضرة المهمة: RUN بيحصل وقت الـ build، و CMD بيحصل لما الـ container يشتغل.

### ليه نسخنا package.json قبل باقي الكود؟

ده اسمه cache-friendly order. Docker بيبني الـ Image على طبقات (layers) وبيحفظ كل طبقة.

- لو غيّرت ملف في الكود، الطبقات اللي قبله (تنزيل المكتبات) بتتاخد من الـ cache، فالبناء بيخلص في ثواني.
- لو كنا نسخنا الكود كله الأول، أي تعديل صغير كان هيخلّي Docker ينزّل المكتبات من الأول.

---

## 5. ممارسات Docker المستخدمة في المشروع

| الممارسة | اتطبقت فين |
|---|---|
| Minimal base image | alpine / slim في كل الـ Images |
| .dockerignore | ملف في كل service (مبنبعتش node_modules ولا ملفات الأسرار) |
| Cache-friendly order | المكتبات قبل الكود في كل Dockerfile |
| Run as non-root | USER node / appuser / app في كل Dockerfile، والـ frontend بيستخدم Nginx unprivileged |
| No secrets in images | مفيش باسوردات جوه أي Dockerfile. كلها بتيجي من ملف .env وقت التشغيل |
| One responsibility | كل container بيشغّل service واحدة |
| Pin versions | كل Image ليها رقم نسخة (node:22 و postgres:16 و redis:7 و mongo:7 ...) |
| Multi-stage builds | الـ frontend و checkoutservice و shippingservice و cartservice |

---

## 6. البناء متعدد المراحل (Multi-stage builds)

الفكرة: بنبني التطبيق في مرحلة فيها أدوات البناء (compiler)، وبعد كده ننقل الناتج المطلوب فقط إلى Image التشغيل النهائية.

مثال: الـ Go (checkoutservice):

```dockerfile
# المرحلة 1: بناء (فيها Go compiler، حجمها كبير)
FROM golang:1.27-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /server .

# المرحلة 2: تشغيل (Alpine صغيرة، فيها البرنامج الجاهز بس)
FROM alpine:3.23
COPY --from=builder /server /server
USER appuser
CMD ["/server"]
```

- COPY --from=builder بينسخ الملف الجاهز من المرحلة الأولى.
- النتيجة: الـ Image النهائية أصغر بكتير، لأنها مفيهاش الـ compiler ولا كود المصدر ولا مكتبات البناء. (تقدر تقارن الحجم بنفسك بـ docker image ls).

نفس الفكرة في:

- frontend: المرحلة الأولى Node بتبني Angular، والتانية Nginx بتقدّم الملفات بس.
- cartservice: المرحلة الأولى .NET SDK، والتانية .NET Runtime.

---

## 7. ملف .dockerignore

بيقول لـ Docker: "متبعتش الملفات دي لجوه الـ Image". مثال لـ Node service:

```
node_modules
**/.env
**/.env.dev
uploads
tests
```

فايدته: تقليل الملفات المرسلة إلى سياق البناء، والمساعدة في تقليل حجم الصورة، وتقليل احتمال إدخال ملفات البيئة المحلية (.env) إلى الـImage بالغلط.

---

## 8. Build و Tag

في compose.yaml كل service ليها سطرين:

```yaml
build: ./src/gateway
image: shopora/gateway:${TAG:-1.0}
```

- build: فين الـ Dockerfile.
- image: اسم الـ Image ورقم نسختها (tag). القيمة الافتراضية 1.0، وتقدر تغيّرها من ملف .env (TAG=1.1).

يعني Docker هيطلّع Images بأسماء زي:

```
shopora/gateway:1.0
shopora/authservice:1.0
shopora/frontend:1.0
```

ويمكن استخدام الوسوم الواضحة للصور ضمن إعداد CI/CD لاحقًا. الأوامر اليدوية لو احتجتها:

```bash
docker build -t shopora/gateway:1.0 ./src/gateway
docker tag shopora/gateway:1.0 shopora/gateway:latest
docker images
```

---

## 9. الـ Network

في آخر compose.yaml:

```yaml
networks:
  shopora-network:
```

وكل service مكتوب فيها:

```yaml
networks:
  - shopora-network
```

النتيجة: تستطيع الحاويات الموجودة على شبكة Compose استخدام أسماء الخدمات للوصول إلى بعضها بدل الاعتماد على عناوين IP ثابتة. مثلًا الـ gateway بيكلّم الـ auth على العنوان:

```
http://authservice:8080
```

ومبدأ DevOps اللي اتطبق: "اكشف للخارج اللي المستخدم محتاجه بس".

- الحاجة الوحيدة المفتوحة على جهازك هي الـ frontend على بورت 8080.
- Mongo و Postgres و Redis وكل الـ services مش بتتفتح لبره (مفيش ports ليهم).

لو عايز تدخل على Mongo من برنامج زي Compass وقت التجربة، ضيف مؤقتًا في service الـ mongo:

```yaml
ports:
  - "27017:27017"
```

---

## 10. الـ Volumes

الـ containers بتتمسح، فالداتا اللي مينفعش تضيع بنحطها في volume.

| الـ Volume | بيحفظ إيه |
|---|---|
| mongo-data | الحسابات والمنتجات والـ categories وفهرس البحث |
| postgres-data | الطلبات (orders) |
| redis-data | الـ cart والـ tokens والمدفوعات |
| uploads-data | صور المنتجات (لما STORAGE_DRIVER=local) |

تقدر تتأكد إن الداتا بتفضل:

```bash
docker compose down
docker compose up -d
```

هتلاقي المنتجات والحسابات لسه موجودة. ومع الأمر:

```bash
docker compose down -v
```

كله بيتمسح، فاستخدمه وانت متأكد.

أوامر المحاضرة للـ volumes:

```bash
docker volume ls
docker volume inspect shopora_mongo-data
```

(اسم الـ project هو shopora، ومحدد في أول compose.yaml، فبيتحط قبل اسم الـ volume وأسماء الـ containers.)

---

## 11. شرح compose.yaml (مثال: authservice)

```yaml
authservice:
  build: ./src/authservice
  image: shopora/authservice:${TAG:-1.0}
  environment:
    PORT: 8080
    DB_URI: mongodb://mongo:27017/shopora-auth
    REDIS_URL: redis://redis:6379
    JWT_SECRET: ${JWT_SECRET:?Set JWT_SECRET in the .env file}
  depends_on:
    mongo:
      condition: service_healthy
    redis:
      condition: service_healthy
  networks:
    - shopora-network
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:8080/health > /dev/null"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 15s
  restart: unless-stopped
```

| الجزء | معناه |
|---|---|
| build / image | يبني منين، واسم الـ Image |
| environment | متغيرات البيئة (الإعدادات). الـ service مبتتعملش لها hardcode في الكود |
| mongo:27017 في DB_URI | اسم الـ service بيشتغل زي عنوان (بسبب الـ network) |
| ${JWT_SECRET:?...} | بياخد القيمة من ملف .env، ولو ناقصة يوقف ويكتب الرسالة |
| ${TAG:-1.0} | بياخد TAG من .env، ولو مش موجود يستخدم 1.0 |
| depends_on + service_healthy | ما تشغّلش الـ service دي إلا لما Mongo و Redis يبقوا جاهزين فعلًا |
| healthcheck | أمر بيسأل الـ service كل 10 ثواني "إنت كويسة؟" (بيفتح صفحة health) |
| restart: unless-stopped | لو الـ container وقع يقوم تاني لوحده |

### ليه الـ depends_on مع healthcheck؟

لو شغّلنا الـ service قبل ما Mongo يخلّص تشغيل، هتقع. الـ healthcheck بيقول لـ Docker متى الـ database بقت جاهزة.

ترتيب التشغيل اللي بيحصل لوحده:

```
databases  →  currencyservice  →  catalog  →  باقي الـ services  →  gateway  →  frontend
```

---

## 12. الـ Nginx جوه الـ frontend

الـ frontend container فيه Nginx بيعمل حاجتين:

1. يقدّم ملفات الموقع (Angular).
2. يوجّه الطلبات:

```
/api/...                     →  gateway
/uploads/...                 →  gateway (صور المنتجات)
/api/payments/webhook        →  paymentservice (علشان Stripe لو استخدمته)
أي حاجة تانية                →  index.html (لأن Angular موقع single page)
```

فالمتصفح بيتعامل مع عنوان واحد بس (localhost:8080)، وده نفس فكرة الـ Reverse Proxy اللي مطلوبة في مشروعكم.

---

## 13. أوامر هتستخدمها كل يوم

```bash
docker compose ps                      # حالة الـ containers
docker compose logs -f gateway         # اللوج بتاع service معينة
docker compose logs -f                 # لوج كل حاجة
docker compose restart gateway         # إعادة تشغيل service
docker compose up -d --build gateway   # أعدّل الكود وأعيد بناء service واحدة
docker compose exec gateway sh         # ادخل جوه الـ container
docker compose exec gateway whoami     # هيطبع node (مش root)
docker stats                           # استهلاك الـ CPU والـ RAM
docker inspect shopora-gateway-1       # كل التفاصيل
docker image ls                        # الـ Images
docker image prune                     # امسح الـ Images اللي مش مستخدمة
```

ترتيب مقترح لاستكشاف الأخطاء: ps ثم logs ثم exec.

---

## 14. مشاكل ممكن تقابلك

| المشكلة | الحل |
|---|---|
| required variable ... is missing | ملف .env مش موجود أو ناقص قيمة. اعمل cp .env.example .env |
| port is already allocated (8080) | في برنامج تاني على بورت 8080. اقفله أو غيّر السطر 8080:8080 في compose.yaml لـ 9090:8080 |
| service بتفضل unhealthy | docker compose logs اسم-الـ-service وشوف الـ error (غالبًا الـ database لسه بتقوم) |
| عدّلت الكود ومفيش تغيير | لازم تبني تاني: docker compose up -d --build |
| الموقع بيفتح بس الـ API بيرجع 502 | الـ gateway لسه بيقوم. استنى دقيقة وشوف docker compose ps |
| مش جايلك كود الـ OTP | اتطبع في اللوج: docker compose logs authservice |
| عايز تصفّر كل حاجة | docker compose down -v ثم docker compose up -d --build |
| الـ build بتاع Go أو .NET وقع | ابعتلي الـ error (شوف الجزء الجاي) |

---
