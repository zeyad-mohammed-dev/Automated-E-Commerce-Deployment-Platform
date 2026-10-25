# checkoutservice: places the order (Go, gRPC)
# Multi-stage build: stage 1 has the Go compiler, stage 2 has only the finished program.

# ---------- stage 1: build ----------
FROM golang:1.27-alpine AS builder
WORKDIR /src

# download the libraries first (cached when go.mod and go.sum do not change)
COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO_ENABLED=0 makes one static file that runs on any small image
RUN CGO_ENABLED=0 go build -o /server .

# ---------- stage 2: run ----------
FROM alpine:3.23
# do not run as root
RUN adduser -D -u 10001 appuser
COPY --from=builder /server /server
USER appuser

EXPOSE 5050

CMD ["/server"]
