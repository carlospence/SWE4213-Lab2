const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const PORT = 3003;

// TODO: Create a PostgreSQL connection pool
// HINT: Same pattern as user-service and product-service
const pool = new Pool({
  host: process.env.DB_HOST || 'order-db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'orderdb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Wait for database to be ready (provided for you)
const waitForDB = async (retries = 10, delay = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Connected to database');
      return;
    } catch (err) {
      console.log(`Waiting for database... attempt ${i + 1}/${retries}`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('Could not connect to database');
};

// Helper: Validate that a user exists by calling the User Service
// HINT: Use fetch() to call http://user-service:3001/users/:id
// Return the user object if found, or null if not
const validateUser = async (userId) => {
  // TODO: Implement inter-service communication
  // YOUR CODE HERE
  try {
    const response = await fetch(`http://user-service:3001/users/${userId}`);
    if (response.ok) {
      const user = await response.json();
      return user;
    } else if (response.status === 404) {
      return null;
    } else {
      console.error(`Error validating user: ${response.statusText}`);
      return null;
    }
  } catch (err) {
    console.error(`Error validating user: ${err}`);
    const e = new Error('User Service Unreachable');
    e.code = 'SERVICE_UNAVAILABLE';
    throw e;
  }
};

// Helper: Validate that a product exists by calling the Product Service
// HINT: Use fetch() to call http://product-service:3002/products/:id
// Return the product object if found, or null if not
const validateProduct = async (productId) => {
  // TODO: Implement inter-service communication
  // YOUR CODE HERE
  try {
    const response = await fetch(`http://product-service:3002/products/${productId}`);
    if (response.ok) {
      const product = await response.json();
      return product;
    } else if (response.status === 404) {
      return null;
    } else {
      // console.error(`Error validating product: ${response.statusText}`);
      // return null;
      // treat non-404 non-ok responses as service failure
      const err = new Error(`Product service returned ${response.status}`);
      err.code = 'SERVICE_UNAVAILABLE';
      throw err;
    }
  } catch (err) {
    console.error(`Error validating product: ${err}`);
    const e = new Error('Product Service Unreachable');
    e.code = 'SERVICE_UNAVAILABLE';
    throw e;
  }
};

// TODO: Implement GET /orders - List all orders
// Query: SELECT * FROM orders ORDER BY id
app.get('/orders', async (req, res) => {
  // YOUR CODE HERE
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error fetching orders" });
  }
});

// TODO: Implement POST /orders - Create a new order
// This is the most complex endpoint! Steps:
//   1. Extract user_id, product_id, quantity from req.body
//   2. Validate all fields are present
//   3. Call validateUser(user_id) - return 404 if user not found
//   4. Call validateProduct(product_id) - return 404 if product not found
//   5. Calculate total_price = product.price * quantity
//   6. Insert into orders table
// Query: INSERT INTO orders (user_id, product_id, quantity, total_price) VALUES ($1, $2, $3, $4) RETURNING *
// Add a 503 Service Unreachable error if the User Service or Product Service calls fail (e.g. network error)

app.post('/orders', async (req, res) => {
  // YOUR CODE HERE
  const { user_id, product_id, quantity } = req.body;

  if (!user_id || !product_id || quantity === undefined) {
    return res.status(400).json({ error: 'user_id, product_id, and quantity are required' });
  }
  try {
    let user;
    try {
      user = await validateUser(user_id);
    } catch (err) {
      if (err && err.code === 'SERVICE_UNAVAILABLE') {
        return res.status(503).json({ error: 'User Service Unreachable' });
      }
      throw err;
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let product;
    try {
      product = await validateProduct(product_id);
    } catch (err) {
      if (err && err.code === 'SERVICE_UNAVAILABLE') {
        return res.status(503).json({ error: 'Product Service Unreachable' });
      }
      throw err;
    }
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const total_price = product.price * quantity;
    const result = await pool.query(
      'INSERT INTO orders (user_id, product_id, quantity, total_price) VALUES ($1, $2, $3, $4) RETURNING *',
      [user_id, product_id, quantity, total_price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error creating order" });
  }
});

// TODO: Implement GET /orders/:id - Get order by ID
// Query: SELECT * FROM orders WHERE id = $1
app.get('/orders/:id', async (req, res) => {
  // YOUR CODE HERE
  const id = Number(req.params.id);
  try {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error fetching order" });
  }
});

const initDB = async () => {
  await pool.query(`
   CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
  `);
};

// Health check
// Verify the database connection is alive and the service is running
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'Order Service is running and database is connected' });
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Start server after DB is ready
waitForDB().then(async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Order Service running on port ${PORT}`);
  });
});
