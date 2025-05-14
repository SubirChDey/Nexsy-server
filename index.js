const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express();

const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');

const corsOptions = {
  origin: ['http://localhost:5173'],
  credentials: true,
  optionalSuccessStatus: 200,
}
// middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.o5v4c.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: 'unauthorized access' });

  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
}

async function run() {


  try {

    const productsCollection = client.db('nexsyDB').collection('products')
    const userCollection = client.db('nexsyDB').collection('users')
    const couponsCollection = client.db('nexsyDB').collection('coupons')


    // Generate JWT
    app.post('/jwt', async (req, res) => {
      const email = req.body
      const token = jwt.sign(email, process.env.SECRET_KEY, { expiresIn: '24h', })
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({ success: true })
    })

    // logout, clear cookie from browser
    app.get('/logout', async (req, res) => {
      res.clearCookie('token', {
        maxAge: 0,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      })
        .send({ success: true })
    })

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection

    // get my products
    app.get('/myProducts', async (req, res) => {
      const email = req.query.email;
      const query = { ownerEmail: email }
      const result = await productsCollection.find(query).toArray();
      res.send(result)
    })


    // get all products
    app.get('/products', async (req, res) => {
      const result = await productsCollection.find().toArray();
      res.send(result)
    })

    app.get('/acceptedProducts', async (req, res) => {
      const search = req.query.search || '';
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 6;

      const query = {
        status: 'Accepted',
        ...(search && {
          tags: { $elemMatch: { $regex: search, $options: 'i' } },
        }),
      };

      try {
        const totalCount = await productsCollection.countDocuments(query);
        const totalPages = Math.ceil(totalCount / limit);

        const products = await productsCollection
          .find(query)
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray();

        res.send({ products, totalPages });
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: 'Failed to fetch products' });
      }
    });




    app.delete('/products/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.deleteOne(query);
      res.send(result);
    });


    // Save all products data in db
    app.post('/products', async (req, res) => {
      const productsData = req.body
      const result = await productsCollection.insertOne(productsData)
      res.send(result)
    })

    // Status update
    app.patch("/products/:id", async (req, res) => {
      const productId = req.params.id;
      const { status } = req.body;

      try {
        const result = await productsCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $set: { status: status } }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Product status updated." });
        } else {
          res.status(404).send({ success: false, message: "No product updated." });
        }
      } catch (error) {
        console.error("Error updating product status:", error);
        res.status(500).send({ success: false, message: "Internal server error." });
      }
    });


    // users get api
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })


    // get current user data to show menu conditionally
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user);
    });

    // Role update
    app.patch("/users/:id", async (req, res) => {
      const userId = req.params.id;
      const { role } = req.body;

      try {
        const result = await userCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { role: role } }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Role updated." });
        } else {
          res.status(404).send({ success: false, message: "No user updated." });
        }
      } catch (error) {
        console.error("Error updating role:", error);
        res.status(500).send({ success: false, message: "Internal server error." });
      }
    });


    // save users data
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })


    // Get coupons
    app.get('/api/coupons', async (req, res) => {
      try {
        const coupons = await couponsCollection.find().sort({ createdAt: -1 }).toArray();
        res.json(coupons);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });


    // Add new coupons
    app.post('/api/coupons', async (req, res) => {
      const { code, expiryDate, description, discount } = req.body;
      try {
        const result = await couponsCollection.insertOne({
          code,
          expiryDate: new Date(expiryDate),
          description,
          discount: Number(discount),
          createdAt: new Date()
        });
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // Update coupons
    app.put('/api/coupons/:id', async (req, res) => {
      const { id } = req.params;
      const { code, expiryDate, description, discount } = req.body;
      try {
        const result = await couponsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              code,
              expiryDate: new Date(expiryDate),
              description,
              discount: Number(discount)
            }
          }
        );
        res.json({ modifiedCount: result.modifiedCount });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });


    // Delete coupon
    app.delete('/api/coupons/:id', async (req, res) => {
      const { id } = req.params;
      try {
        const result = await couponsCollection.deleteOne({ _id: new ObjectId(id) });
        res.json({ deletedCount: result.deletedCount });
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });


    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Nexsy Server')
})

app.listen(port, () => {
  console.log(`running on port ${port}`);

})

