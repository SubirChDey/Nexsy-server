const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const app = express();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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
  console.log(req.headers.authorization)
  if (!req.headers.authorization) {

    return res.status(401).send({ message: 'unauthorized access' });
  }
  const token = req.headers.authorization.split(' ')[1];
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}

const verifyAdmin = async (req, res, next) => {
  const email = req.decoded.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);
  const isAdmin = user?.role === 'admin';
  if (!isAdmin) {
    return res.status(403).send({ message: 'forbidden access' });
  }
  next();
}

async function run() {


  try {

    const productsCollection = client.db('nexsyDB').collection('products')
    const userCollection = client.db('nexsyDB').collection('users')
    const couponsCollection = client.db('nexsyDB').collection('coupons')
    const reviewsCollection = client.db('nexsyDB').collection('reviews')


    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_KEY, {
        expiresIn: '10h'
      });
      res.send({ token });
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
    app.get('/myProducts', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "unauthorized access" });
      }
      const query = { ownerEmail: email }
      const result = await productsCollection.find(query).toArray();
      res.send(result)
    })


    // get specific product
    app.get('/product/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(filter);
      res.send(result)
    })


    app.patch("/product/:id", async (req, res) => {
      const updateFields = req.body;

      try {
        const result = await productsCollection.updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: updateFields }
        );

        if (result.modifiedCount === 0) {
          return res.status(400).json({ error: "No changes made" });
        }

        res.json({ message: "Product updated successfully" });
      } catch (err) {
        res.status(500).json({ error: "Failed to update product" });
      }
    });



    // upVote in productDetail page
    app.patch('/products/upvote/:id', async (req, res) => {
      const id = req.params.id;
      const { email } = req.body;

      const product = await productsCollection.findOne({ _id: new ObjectId(id) });

      if (!product) {
        return res.status(404).send({ error: 'Product not found' });
      }

      const alreadyVoted = product.votedEmails?.includes(email);
      if (alreadyVoted) {
        return res.send({ modifiedCount: 0 });
      }

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $inc: { upVote: 1 },
          $addToSet: { votedEmails: email },
        }
      );

      res.send(result);
    });

    // post report button
    app.post('/products/report/:id', async (req, res) => {
      const id = req.params.id;
      const { reporterEmail } = req.body;

      const product = await productsCollection.findOne({ _id: new ObjectId(id) });

      if (!product) {
        return res.status(404).send({ success: false, message: 'Product not found' });
      }

      const alreadyReported = product.reportedBy?.includes(reporterEmail);
      if (alreadyReported) {
        return res.send({ success: false });
      }

      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $addToSet: { reportedBy: reporterEmail },
        }
      );

      res.send({ success: result.modifiedCount > 0 });
    });

    // report get route
    app.get('/products/reported', async (req, res) => {
      const reportedProducts = await productsCollection
        .find({ reportedBy: { $exists: true, $not: { $size: 0 } } })
        .toArray();
      res.send(reportedProducts);
    });

    // reported product delete route
    app.delete('/products/:id', async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // ignore reported product
    app.patch('/products/ignore-report/:id', async (req, res) => {
      const id = req.params.id;
      const result = await productsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { reportedBy: [] } }
      );
      res.send(result);
    });




    // reviews get
    app.get('/reviews', async (req, res) => {
      const productId = req.query.productId;
      const result = await reviewsCollection.find({ productId }).toArray();
      res.send(result);
    });


    // Review post
    app.post('/reviews', async (req, res) => {
      const review = req.body;
      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });





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

    // Trending products
    app.get('/trendingProducts', async (req, res) => {
      const result = await productsCollection.find().sort({ upVote: -1 })
        .limit(6)
        .toArray()
      res.send(result)
    })

    // Feature products
    app.get('/featuredProducts', async (req, res) => {
      const result = await productsCollection.find({ featured: true }).sort({ createdAt: -1 })
        .limit(4)
        .toArray()
      res.send(result)
    })

    // upvote from feature section
    app.patch("/products/upvote/:id", async (req, res) => {
      try {
        const productId = req.params.id;
        const { userId } = req.body;

        if (!ObjectId.isValid(productId)) {
          return res.status(400).json({ error: "Invalid product ID" });
        }

        const product = await productsCollection.findOne({ _id: new ObjectId(productId) });

        if (!product) {
          return res.status(404).json({ error: "Product not found" });
        }

        if (product.ownerId === userId) {
          return res.status(403).json({ error: "Owner cannot vote on their own product" });
        }

        if ((product.voters || []).includes(userId)) {
          return res.status(403).json({ error: "User has already voted" });
        }

        const updated = await productsCollection.findOneAndUpdate(
          { _id: new ObjectId(productId) },
          {
            $inc: { upVote: 1 },
            $push: { voters: userId },
          },
          { returnDocument: "after" }
        );

        res.send({ success: true, upVote: updated.value.upVote });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Something went wrong" });
      }
    });

    // Status or Featured update
    app.patch("/products/:id", async (req, res) => {
      const productId = req.params.id;
      const updateFields = req.body;

      try {
        const result = await productsCollection.updateOne(
          { _id: new ObjectId(productId) },
          { $set: updateFields }
        );

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Product updated successfully." });
        } else {
          res.status(404).send({ success: false, message: "No product updated." });
        }
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).send({ success: false, message: "Internal server error." });
      }
    });



    // users get api
    app.get('/users', verifyToken, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })


    // get current user data to show menu conditionally,
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      res.send(user);
    });

    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      res.json({ role: user.role });
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

    // my profile for user route
    app.get("/user/profile", verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });


    // admin statistics page get route
    app.get('/admin/statistics', verifyToken, async (req, res) => {
      try {
        const totalProducts = await productsCollection.countDocuments();
        const acceptedProducts = await productsCollection.countDocuments({ status: 'accepted' });
        const pendingProducts = await productsCollection.countDocuments({ status: 'pending' });

        const totalUsers = await userCollection.countDocuments();
        const totalReviews = await reviewsCollection.countDocuments();

        res.send({
          totalProducts,
          acceptedProducts,
          pendingProducts,
          totalUsers,
          totalReviews,
        });
      } catch (error) {
        console.error('Statistics Error:', error);
        res.status(500).send({ message: 'Failed to get admin statistics' });
      }
    });



    // Get coupons
    app.get('/api/coupons', async (req, res) => {
      try {
        const coupons = await couponsCollection.find().sort({ createdAt: -1 }).toArray();
        res.json(coupons);
      } catch (err) {
        res.status(500).json({ message: err.message });
      }
    });

    // get coupon code for homepage
    app.get('/api/couponCode', async (req, res) => {
      try {
        const coupons = await couponsCollection.find().sort({ expiryDate: 1 }).toArray();
        res.send(coupons);
      } catch (error) {
        console.error("Error fetching coupons:", error);
        res.status(500).send({ error: "Failed to fetch coupons" });
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

    // payments method      

    app.post("/create-payment-intent", async (req, res) => {
      const { amount, email, coupon } = req.body;
      let finalAmount = amount;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: finalAmount * 100,
        currency: "usd",
        metadata: { email, coupon },
      });

      res.send(paymentIntent.client_secret);
    });

// update subscription status
    app.patch("/user/subscribe", async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).json({ error: "Email query is required" });
      }

      try {
        const result = await userCollection.updateOne(
          { email: email },
          { $set: { isSubscribed: true } }
        );

        if (result.modifiedCount === 0) {
          return res.status(400).json({ error: "No changes made or user already subscribed" });
        }

        res.json({ message: "User subscription updated successfully" });
      } catch (err) {
        res.status(500).json({ error: "Failed to update subscription" });
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

