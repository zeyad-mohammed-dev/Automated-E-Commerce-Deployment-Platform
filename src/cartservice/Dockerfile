# cartservice: the shopping cart, saved in Redis (C# / .NET 10, gRPC)
# Multi-stage build: stage 1 has the .NET SDK (big), stage 2 has only the runtime (small).

# ---------- stage 1: build ----------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# restore the libraries first (cached when the .csproj does not change)
COPY src/cartservice.csproj src/
RUN dotnet restore src/cartservice.csproj

COPY src/ src/
RUN dotnet publish src/cartservice.csproj -c Release -o /out --no-restore

# ---------- stage 2: run ----------
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .

# the port the cart listens on (the other services expect 7070)
ENV ASPNETCORE_HTTP_PORTS=7070

# do not run as root ('app' is a ready user in the .NET images)
USER app

EXPOSE 7070

ENTRYPOINT ["dotnet", "cartservice.dll"]
