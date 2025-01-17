const express = require("express");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://eduelevate.web.app",
      "https://eduelevate.firebaseapp.com",
    ],
  })
);
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0xqywot.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const db = client.db("eduelevateDB");
    const classCollection = db.collection("classes");
    const userCollection = db.collection("users");
    const enrollmentCollection = db.collection("enrollments");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    // stripe payment related api
    app.post("/create-payment-intent", async (req, res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;

      if (!price || priceInCent < 1) return;

      // generate clientSecret
      const { client_secret } = await stripe.paymentIntents.create({
        amount: priceInCent,
        currency: "usd",
        // In the latest version of the API, specifying the `automatic_payment_methods` parameter is optional because Stripe enables its functionality by default.
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // send client secret as response
      res.send({ clientSecret: client_secret });
    });

    // user related apis
    // ===========================================================================

    // get all users from db
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // get all users who requested to be a teacher
    app.get("/teacher-requests", async (req, res) => {
      const query = { status: { $in: ["Pending", "Rejected", "Accepted"] } };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // get a certain user by email
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send(result);
    });

    // save a user data in db
    app.put("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };

      // check if user already exist in db
      const isExist = await userCollection.findOne(query);
      if (isExist) {
        if (user.status === "Pending") {
          const result = await userCollection.updateOne(query, {
            $set: {
              status: user?.status,
              teacherReqData: user?.teacherReqData,
            },
          });
          return res.send(result);
        }
        return res.send(isExist);
      }

      // save user for the first time
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
        },
      };

      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // approve teacher request and update a user role to teacher
    app.patch("/teacher-approve/:id", async (req, res) => {
      const id = req.params.id;
      const user = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...user,
          role: "teacher",
          status: "Accepted",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // reject teacher request
    app.patch("/teacher-reject/:id", async (req, res) => {
      const id = req.params.id;
      const user = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...user,
          status: "Rejected",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // update a user role to admin
    app.patch("/user/:id", async (req, res) => {
      const id = req.params.id;
      const user = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...user,
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // class related apis
    // ===========================================================================

    // get the classes
    app.get("/classes", async (req, res) => {
      const query = { status: "Accepted" };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    // get a certain class
    app.get("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    // get classes for a certain user by email
    app.get("/teacher-classes/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    // get all classes which requested from teacher
    app.get("/class-requests", async (req, res) => {
      const query = { status: { $in: ["Pending", "Rejected", "Accepted"] } };
      const result = await classCollection.find(query).toArray();
      res.send(result);
    });

    // save a class
    app.post("/classes", async (req, res) => {
      let aClass = req.body;

      aClass = { classId: new ObjectId(), ...aClass };
      const result = await classCollection.insertOne(aClass);
      res.send(result);
    });

    // update a certain class
    app.put("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const classData = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateData = {
        $set: classData,
      };

      const result = await classCollection.updateOne(filter, updateData);
      res.send(result);
    });

    // approve class request
    app.patch("/class-approve/:id", async (req, res) => {
      const id = req.params.id;
      const classData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...classData,
          status: "Accepted",
        },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // reject class request
    app.patch("/class-reject/:id", async (req, res) => {
      const id = req.params.id;
      const classData = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...classData,
          status: "Rejected",
        },
      };
      const result = await classCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // delete a certain class
    app.delete("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.deleteOne(query);
      res.send(result);
    });

    // ==============================================================================

    // get all enrolled classes
    app.get("/enrolledClasses", async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    // get enrolled classes for a certain user by email
    app.get("/enrolled-classes/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await enrollmentCollection.find(query).toArray();
      res.send(result);
    });

    // get a certain enrolled class
    app.get("/enrolled-class/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    // class enroll payment
    app.post("/enroll", async (req, res) => {
      const enrollData = req.body;
      const result = await enrollmentCollection.insertOne(enrollData);
      res.send(result);
    });

    // add a assignment
    app.put("/add-assignment/:id", async (req, res) => {
      const id = req.params.id;
      let assignmentData = req.body;

      assignmentData = { assignmentId: new ObjectId(), ...assignmentData };

      console.log("[id]", id);
      console.log("[assignmentData]", assignmentData);

      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateData = {
        $inc: { assignmentCount: 1 },
        $push: { assignments: assignmentData },
      };

      const result = await classCollection.updateOne(
        filter,
        updateData,
        options
      );
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to EduElevate server");
});

// connect app to the port
app.listen(port, () => {
  console.log(`EduElevate running on PORT : ${port}`);
});
