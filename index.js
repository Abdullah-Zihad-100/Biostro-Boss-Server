const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.SECRET_STRIPE);
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
const app = express();
require("dotenv").config();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.USER_PASSWORD}@cluster0.hmqrzhm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB client setup
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    const menuCollection = client.db("Bisrro-boss").collection("menu");
    const reviewsCollection = client.db("Bisrro-boss").collection("Reviews");
    const cartsCollection = client.db("Bisrro-boss").collection("carts");
    const usersCollection = client.db("Bisrro-boss").collection("users");
    const paymentsCollection = client.db("Bisrro-boss").collection("payments");

    // JWT middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "forbidden access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      // if (!token) {
      //   return res.status(401).send({ message: "forbidden access" });
      // }
      jwt.verify(token, process.env.SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send("forbidden access");
      }
      next();
    };


    // payment intent

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });



    // payment related api

    app.post('/payments',async(req,res)=>{
      const payment=req.body
      const paymentResult=await paymentsCollection.insertOne(payment)
      // carefully delete each item form card
      console.log('payment info',payment);
      const query={_id:{
        $in:payment.cartIds.map(id => new ObjectId(id))
      }}
      const deleteResult=await cartsCollection.deleteMany(query)
      res.send({paymentResult,deleteResult})
    })

    app.get("/payments", verifyToken, async (req, res) => {
      const email = req.query.email;
      if (email !== req.decoded?.email) {
        return res.status(403).send("unauthorized access");
      }

      const result = await paymentsCollection.find({ email: email }).toArray();
      res.send(result);
    });



    // JWT route
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET, { expiresIn: "1h" });
      res.send({ token });
    });

    // User routes
    app.post("/users", async (req, res) => {
      const body = req.body;
      const query = { email: body?.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists", insertedId: null });
      }
      const result = await usersCollection.insertOne(body);
      res.send(result);
    });

    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send("unauthorized access");
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ admin: user?.role === "admin" });
    });

    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });

    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDocs = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(filter, updatedDocs);
        res.send(result);
      }
    );

    // Menu routes
    app.get("/menu", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.post("/menu",verifyToken,verifyAdmin, async (req, res) => {
      const menu = req.body;
      const result = await menuCollection.insertOne(menu);
      res.send(result);
    });

    // Reviews routes
    app.get("/reviews", async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    // Cart routes
    app.get("/carts", async (req, res) => {
      const email = req.query.email;
      const query = email ? { email } : {};
      const result = await cartsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const cartItems = req.body;
      const result = await cartsCollection.insertOne(cartItems);
      res.send(result);
    });


    // carts delete
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartsCollection.deleteOne(query);
      res.send(result);
    });



    app.delete("/menu/:id" ,async(req,res)=>{
      const id=req.params.id;
      const query={_id: new ObjectId(id)}
      const result=await menuCollection.deleteOne(query);
      res.send(result)
    })

    app.get("/menu/:id",async(req,res)=>{
      const id=req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await menuCollection.findOne(query);
        res.send(result);
    })

    app.patch("/menu/:id",async(req,res)=>{
      const id=req.params.id;
      const item=req.body;
        const filter = { _id: new ObjectId(id) };
        const updatedDocs={
          $set:{
            name:item.name,
            recipe:item.recipe,
            price:item.price,
            category:item.category,
            image:item.image,
          }
        }
        const result = await menuCollection.updateOne(filter,updatedDocs);
        res.send(result);
    })

    // Ping to confirm MongoDB connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. Successfully connected to MongoDB!");
  } finally {
    // Optional: ensure client closes when server stops (good practice)
    // process.on("SIGINT", async () => {
    //   await client.close();
    //   console.log("MongoDB client closed");
    //   process.exit(0);
    // });
  }
}

run().catch(console.dir);

// Default route
app.get("/", (req, res) => {
  res.send("Bistro boss is running");
});

app.listen(port, () => console.log(`App is running on port ${port}`));
