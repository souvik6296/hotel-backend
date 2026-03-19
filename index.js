const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 Firebase Admin Setup
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ✅ Test route
app.get("/", (req, res) => {
  res.send("Backend Running 🚀");
});

// 🚀 Start server
app.listen(4000, "0.0.0.0", () => {
  console.log("Server running on port 4000");
});


// 📅 Create Booking API
app.post("/book", async (req, res) => {
  console.log("Incoming request:", req.body); // 👈 ADD THIS

  try {
    const {
      roomName,
      pricePerNight,
      totalPrice,
      checkIn,
      checkOut,
      adults,
      children,
    } = req.body;

    const bookingRef = await db.collection("bookings").add({
      roomName,
      pricePerNight,
      totalPrice,
      checkIn,
      checkOut,
      adults,
      children,
      createdAt: new Date(),
    });

    res.json({
      success: true,
      bookingId: bookingRef.id,
    });
  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});