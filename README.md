# Lab 2: Docker & Docker Compose - Microservices E-Commerce Application

# (CHARLES EWAIFOH EJEDAWE - 3789602)

## Learning Objectives

By the end of this lab, you will be able to:

- Write Dockerfiles to containerize Node.js applications
- Use Docker Compose to orchestrate multi-container applications
- Understand microservice architecture patterns (API Gateway, service-per-database)
- Configure inter-service communication within a Docker network
- Use Docker volumes, networks, environment variables, and dependency management

## Prerequisites

Verify your Docker installation:

```bash
docker --version
docker compose version
```

## Architecture Overview

```
                         ┌──────────────┐
                         │   Gateway    │
                         │  (port 3000) │
                         └──────┬───────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
     ┌────────▼──────┐ ┌───────▼───────┐ ┌───────▼───────┐
     │ User Service  │ │Product Service│ │ Order Service │
     │  (port 3001)  │ │  (port 3002)  │ │  (port 3003)  │
     └────────┬──────┘ └───────┬───────┘ └───────┬───────┘
              │                │                 │
     ┌────────▼──────┐ ┌───────▼───────┐ ┌───────▼───────┐
     │   user-db     │ │  product-db   │ │   order-db    │
     │ (PostgreSQL)  │ │ (PostgreSQL)  │ │ (PostgreSQL)  │
     └───────────────┘ └───────────────┘ └───────────────┘
```

Each service has its own database (the **database-per-service** pattern). The **API Gateway** routes external requests to the appropriate service. The **Order Service** communicates with both the User Service and Product Service to validate data before creating orders.

**What's provided:**

- Gateway (complete)
- User Service + user-db (complete) -- use this as your **reference implementation**

**What you'll build:**

- Product Service + product-db
- Order Service + order-db
- Complete the `docker-compose.yml`

---

## Part 1: Understanding the Provided Code

Before writing any code, read through the reference implementation to understand the patterns you'll follow.

### 1.1 The Gateway (`gateway/index.js`)

Open `gateway/index.js`. The gateway uses `http-proxy-middleware` to route requests:


| Incoming Request    | Routed To                              |
| --------------------- | ---------------------------------------- |
| `GET /api/users`    | `http://user-service:3001/users`       |
| `GET /api/products` | `http://product-service:3002/products` |
| `GET /api/orders`   | `http://order-service:3003/orders`     |

Notice that the gateway refers to services by their **container name** (e.g., `user-service`), not `localhost`. This is because Docker Compose creates a shared network where containers can reach each other by service name.

### 1.2 The User Service (`user-service/index.js`)

This is your **reference implementation**. Study it carefully -- you'll follow the same patterns for the Product and Order services.

Key things to note:

1. **Database connection** using `pg.Pool` with environment variables:

   ```javascript
   const pool = new Pool({
     host: process.env.DB_HOST || 'user-db',
     port: parseInt(process.env.DB_PORT || '5432'),
     database: process.env.DB_NAME || 'userdb',
     user: process.env.DB_USER || 'postgres',
     password: process.env.DB_PASSWORD || 'postgres',
   });
   ```
2. **Wait for database** -- the `waitForDB` function retries the connection because the database container may take a few seconds to start.
3. **Database initialization** -- the `initDB` function creates the database table on startup using `CREATE TABLE IF NOT EXISTS`, and inserts seed data if the table is empty. This is critical because when the images run from a Docker registry there are no `init.sql` files to mount into the database container. Each service must create its own tables in code:

   ```javascript
   const initDB = async () => {
     await pool.query(`
       CREATE TABLE IF NOT EXISTS users (
         id SERIAL PRIMARY KEY,
         name VARCHAR(100) NOT NULL,
         email VARCHAR(100) UNIQUE NOT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )
     `);
     const { rowCount } = await pool.query('SELECT 1 FROM users LIMIT 1');
     if (rowCount === 0) {
       await pool.query(`
         INSERT INTO users (name, email) VALUES
           ('Alice Johnson', 'alice@example.com'),
           ('Bob Smith', 'bob@example.com')
       `);
     }
   };
   ```
4. **Startup chain** -- the server starts only after both the database connection and schema initialization succeed:

   ```javascript
   waitForDB().then(async () => {
     await initDB();
     app.listen(PORT, () => {
       console.log(`User Service running on port ${PORT}`);
     });
   });
   ```
5. **Three REST endpoints**: `GET /users`, `POST /users`, `GET /users/:id`

### 1.3 Database Initialization (`init.sql` vs `initDB`)

The `init.sql` files define the table schemas and seed data for each service. During local development the `docker-compose.yml` mounts these files into the PostgreSQL containers via bind mounts (e.g., `./user-service/init.sql:/docker-entrypoint-initdb.d/init.sql`), and PostgreSQL executes them on first startup.

**However, this does not work when images are pulled from a Docker registry.** The grading compose file has no `build` step and no bind mounts -- the database containers start completely empty. If your service relies only on `init.sql`, the tables will never be created and your service will crash.

This is why each service must also include an `initDB` function that creates the tables in application code. The `init.sql` files remain useful as a reference for the schemas, but the `initDB` function is what makes your images portable and self-contained. Use `CREATE TABLE IF NOT EXISTS` so it is safe to run every time the service starts.

---

## Part 2: Understanding the Dockerfile

Open `user-service/Dockerfile`:

```dockerfile
FROM node:18-alpine          # Base image: Node.js 18 on Alpine Linux (small)

WORKDIR /app                 # Set working directory inside container

COPY package*.json ./        # Copy dependency files first (for layer caching)

RUN npm install              # Install dependencies

COPY . .                     # Copy application code

EXPOSE 3001                  # Document which port the app uses

CMD ["npm", "start"]         # Command to run when container starts
```

The Dockerfiles for the Product and Order services are already provided and follow the same pattern (with different `EXPOSE` ports).

---

## Part 3: Understanding Docker Compose

Open `docker-compose.yml` and study the provided entries for `gateway`, `user-service`, and `user-db`.

Key Docker Compose concepts demonstrated:


| Concept          | Example                                          | Purpose                                                  |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| `build`          | `build: ./user-service`                          | Build image from a Dockerfile in the specified directory |
| `ports`          | `"3001:3001"`                                    | Map host port to container port                          |
| `environment`    | `DB_HOST: user-db`                               | Set environment variables inside the container           |
| `depends_on`     | `depends_on: - user-db`                          | Start dependencies first (does not wait for readiness)   |
| `volumes`        | `user-data:/var/lib/postgresql/data`             | Persist database data across container restarts          |
| `volumes` (bind) | `./user-service/init.sql:/docker-entrypoint-...` | Mount a file from host into the container                |
| `networks`       | `networks: - app-network`                        | Place containers on a shared network                     |

---

## Part 4: Build the Product Service

Now it's your turn! Open `product-service/index.js`. You'll see skeleton code with `// YOUR CODE HERE` markers.

### 4.1 Database Connection Pool

Fill in the `Pool` configuration. Use the same pattern as `user-service/index.js`, but with defaults appropriate for the product database:

- Default host: `product-db`
- Default database name: `productdb`

### 4.2 GET /products

Implement the handler to return all products:

```
Query: SELECT * FROM products ORDER BY id
```

Follow the same try/catch pattern as `GET /users` in the user service.

### 4.3 POST /products

Implement the handler to create a new product. Required fields: `name`, `description`, `price`.

```
Query: INSERT INTO products (name, description, price) VALUES ($1, $2, $3) RETURNING *
```

Remember to:

- Validate that required fields are present (return 400 if missing)
- Return 201 status on success

### 4.4 GET /products/:id

Implement the handler to get a product by ID:

```
Query: SELECT * FROM products WHERE id = $1
```

Remember to return 404 if the product is not found.

### 4.5 Database Initialization (`initDB`)

Add an `initDB` function that creates the `products` table and seeds it with data. Follow the same pattern as the user service, using the schema from `product-service/init.sql`:

```sql
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

Also insert seed data if the table is empty (check with `SELECT 1 FROM products LIMIT 1`). Use the seed data from `init.sql`.

Update the startup chain so that `initDB` runs after `waitForDB` and before `app.listen`.

---

## Part 5: Build the Order Service

Open `order-service/index.js`. This service is more complex because it communicates with other services.

### 5.1 Database Connection Pool

Same pattern as before, but with defaults for the order database:

- Default host: `order-db`
- Default database name: `orderdb`

### 5.2 Inter-Service Communication

Implement `validateUser` and `validateProduct`. These functions call the other services over the Docker network:

```javascript
const validateUser = async (userId) => {
  try {
    const response = await fetch(`http://user-service:3001/users/${userId}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error('Error validating user:', err);
    return null;
  }
};
```

Follow the same pattern for `validateProduct`, calling `http://product-service:3002/products/${productId}`.

### 5.3 GET /orders and GET /orders/:id

Same patterns as the other services.

### 5.4 POST /orders

This is the most complex endpoint. Steps:

1. Extract `user_id`, `product_id`, `quantity` from `req.body`
2. Validate all required fields are present (return 400 if missing)
3. Call `validateUser(user_id)` -- return 404 with message `"User not found"` if null
4. Call `validateProduct(product_id)` -- return 404 with message `"Product not found"` if null
5. Calculate `total_price = product.price * quantity`
6. Insert into the database and return the created order with status 201

### 5.5 Database Initialization (`initDB`)

Add an `initDB` function that creates the `orders` table. Follow the same pattern as the user service, using the schema from `order-service/init.sql`:

```sql
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

The orders table has no seed data, so you only need the `CREATE TABLE` query.

Update the startup chain so that `initDB` runs after `waitForDB` and before `app.listen`.

---

## Part 6: Complete docker-compose.yml

Add the missing service entries to `docker-compose.yml`. You need to add:

1. **product-service** -- follow the `user-service` pattern
2. **product-db** -- follow the `user-db` pattern
3. **order-service** -- similar pattern, but `depends_on` should include `order-db`, `user-service`, and `product-service`
4. **order-db** -- follow the `user-db` pattern
5. Add `product-data` and `order-data` to the `volumes` section at the bottom

The hints in the compose file give you all the details you need.

---

## Part 7: Build and Test

### 7.1 Build and Start

```bash
docker compose up --build
```

Watch the logs. You should see all services start and connect to their databases. If a service fails to connect, it will retry automatically.

### 7.2 Test with curl

Open a new terminal and run these commands:

**Test the Gateway health check:**

```bash
curl http://localhost:3000/health
```

**Test User Service (provided -- should work immediately):**

```bash
# List users (should return seed data)
curl http://localhost:3000/api/users

# Create a user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Charlie", "email": "charlie@example.com"}'

# Get user by ID
curl http://localhost:3000/api/users/1
```

**Test Product Service (your code):**

```bash
# List products (should return seed data)
curl http://localhost:3000/api/products

# Create a product
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{"name": "Keyboard", "description": "Mechanical keyboard", "price": 149.99}'

# Get product by ID
curl http://localhost:3000/api/products/1
```

**Test Order Service (your code):**

```bash
# Create an order (should validate user and product exist)
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "product_id": 1, "quantity": 2}'

# List orders
curl http://localhost:3000/api/orders

# Get order by ID
curl http://localhost:3000/api/orders/1

# Test validation - should return 404 "User not found"
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id": 999, "product_id": 1, "quantity": 1}'
```

### 7.3 Useful Docker Commands

```bash
# Stop all services
docker compose down

# Stop and remove volumes (reset databases)
docker compose down -v

# View logs for a specific service
docker compose logs product-service

# Rebuild a single service
docker compose up --build product-service

# List running containers
docker compose ps
```

---

## Part 8: Add Health Checks

Each service should expose a `GET /health` endpoint that returns a `200` status with a JSON body indicating the service is healthy (e.g., `{ "status": "ok" }`). The health check should also verify the database connection is alive.

Once the endpoints are in place, configure Docker Compose `healthcheck` directives for each service. Update `depends_on` to use `condition: service_healthy` so that dependent services wait for their dependencies to be truly ready, not just started.

Example `healthcheck` in `docker-compose.yml`:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
  interval: 10s
  timeout: 5s
  retries: 5
```

---

## Part 9: Add Error Handling for Dependent Services

The Order Service depends on both the User Service and the Product Service. If either of those services is unreachable, the Order Service should handle the failure gracefully instead of crashing or hanging.

- When the Order Service cannot reach the User Service or Product Service, return a `503 Service Unavailable` response with a descriptive error message (e.g., `"User Service is unavailable"`).
- Distinguish between a `404` (resource not found) and a `503` (service unreachable) so the client knows what went wrong.

---

## Part 10: Add Authentication to the Gateway

Add a simple authentication layer to the API Gateway. Use a token-based approach:

- Requests must include an `Authorization` header with a valid token.
- The gateway should validate the token before proxying the request to downstream services.
- Return `401 Unauthorized` if the token is missing or invalid.
- The `/health` endpoint should remain publicly accessible without authentication.

---

## Part 11: Add Rate Limiting to the Gateway

Add rate limiting middleware to the API Gateway to prevent abuse:

- Limit each client (by IP address) to a reasonable number of requests per time window (e.g., 100 requests per 15 minutes).
- Return `429 Too Many Requests` when the limit is exceeded, with a `Retry-After` header indicating when the client can try again.
- Consider using the `express-rate-limit` package.

---

## Part 12: Add Bruno Tests

Create a [Bruno](https://www.usebruno.com/) test collection that covers the full API:

- Test all CRUD endpoints for Users, Products, and Orders through the gateway.
- Include tests for error cases (missing fields, invalid IDs, non-existent resources).
- Include tests for the validation logic in the Order Service (invalid user, invalid product).
- Include a test that verifies rate limiting works as expected (e.g., sending requests beyond the limit returns `429 Too Many Requests`).
- The test collection should be committed to the repository so others can run it.

---

## Part 13: Publish Docker Images to a Registry

Push your service images to a Docker registry (e.g., Docker Hub or GitHub Container Registry) so that the application can be run **without** cloning the source code.

### 13.1 Build, Tag, and Push

After building your images with `docker compose build`, tag and push each one:

```bash
# Log in to Docker Hub
docker login

# Tag each image with your Docker Hub username
docker tag swe4213-lab2-gateway:latest <your-dockerhub-username>/gateway:v1.0
docker tag swe4213-lab2-user-service:latest <your-dockerhub-username>/user-service:v1.0
docker tag swe4213-lab2-product-service:latest <your-dockerhub-username>/product-service:v1.0
docker tag swe4213-lab2-order-service:latest <your-dockerhub-username>/order-service:v1.0

# Push them
docker push <your-dockerhub-username>/gateway:v1.0
docker push <your-dockerhub-username>/user-service:v1.0
docker push <your-dockerhub-username>/product-service:v1.0
docker push <your-dockerhub-username>/order-service:v1.0
```

### 13.2 How Your Lab Will Be Graded

I will run your project using **only** the images you pushed — no source code, no `build` step. I will use the following `docker-compose.yml`, replacing the image names with yours:

```yaml
services:
  gateway:
    image: <your-dockerhub-username>/gateway:v1.0
    ports:
      - "3000:3000"
    depends_on:
      - user-service
      - product-service
      - order-service
    networks:
      - app-network

  user-service:
    image: <your-dockerhub-username>/user-service:v1.0
    ports:
      - "3001:3001"
    environment:
      DB_HOST: user-db
      DB_PORT: 5432
      DB_NAME: userdb
      DB_USER: postgres
      DB_PASSWORD: postgres
    depends_on:
      - user-db
    networks:
      - app-network

  user-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: userdb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - user-data:/var/lib/postgresql/data
    networks:
      - app-network

  product-service:
    image: <your-dockerhub-username>/product-service:v1.0
    ports:
      - "3002:3002"
    environment:
      DB_HOST: product-db
      DB_PORT: 5432
      DB_NAME: productdb
      DB_USER: postgres
      DB_PASSWORD: postgres
    depends_on:
      - product-db
    networks:
      - app-network

  product-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: productdb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - product-data:/var/lib/postgresql/data
    networks:
      - app-network

  order-service:
    image: <your-dockerhub-username>/order-service:v1.0
    ports:
      - "3003:3003"
    environment:
      DB_HOST: order-db
      DB_PORT: 5432
      DB_NAME: orderdb
      DB_USER: postgres
      DB_PASSWORD: postgres
    depends_on:
      - order-db
      - user-service
      - product-service
    networks:
      - app-network

  order-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: orderdb
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - order-data:/var/lib/postgresql/data
    networks:
      - app-network

networks:
  app-network:
    driver: bridge

volumes:
  user-data:
  product-data:
  order-data:
```

Notice there are **no `build` fields and no init.sql mounts** -- I only have your images. This means:

- Your database tables **must** be created by the application code (the `initDB` function), not only by `init.sql`.
- Everything must work with just `docker compose up`.

Make sure to test this yourself before submitting: save the compose file above, replace the image names with yours, and run `docker compose up` in an empty directory.

---

## Submission

Submit the following on **D2L**:

1. A link to your GitHub repository.
2. Your Docker Hub username.

Your repository must include:

1. **All source code** -- the complete project with gateway, user-service, product-service, and order-service (including `index.js`, `Dockerfile`, `package.json`, and `init.sql` for each service).
2. **`docker-compose.yml`** -- the fully completed compose file.
3. **Bruno test collection** -- the Bruno tests from Part 12, committed to the repository so I can open and run them.
4. **Published Docker images** -- your images must be pushed to Docker Hub as described in Part 13.

I will grade your lab by:

1. Pulling your Docker images from the registry and running them with the grading compose file (no source code, no build step).
2. Verifying that all services start, connect to their databases, and create their own tables automatically.
3. Running your Bruno test collection against the running services.

---

## Docker Image Screenshot

![](assets/20260219_023614_20260219_023601_Docker_Images_Screenshot.png)

Note: For the JWT Authentication on the API Gateway, I used a pre-generated JWT Token that will be valid for a future time.
