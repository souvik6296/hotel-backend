require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 Firebase Admin Setup
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : '',
    }),
    databaseURL: "https://eduniketan-freelance-default-rtdb.asia-southeast1.firebasedatabase.app/"
});

const db = admin.database();

const ROOM_INVENTORY = {
    "Deluxe Room": 5,
    "Super Deluxe": 3,
    "Suite": 2
};

// ✅ Test route
app.get("/", (req, res) => {
    res.send("Backend Running 🚀");
});

// 🚀 Start server
app.listen(4000, "0.0.0.0", () => {
    console.log("Server running on port 4000");
});


app.post("/book", async (req, res) => {
    try {
        const {
            roomName,
            pricePerNight,
            totalPrice,
            checkIn,
            checkOut,
            adults,
            children,
            userPhone,
            name,
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature
        } = req.body;

        // 🛡️ Verify Payment Signature
        if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: "Payment details missing ❌" });
        }

        const generated_signature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest("hex");

        if (generated_signature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: "Invalid payment signature ❌" });
        }

        const bookingsRef = db.ref("bookings");
        const snapshot = await bookingsRef.once("value");
        const bookings = snapshot.val();

        const newCheckIn = new Date(checkIn);
        const newCheckOut = new Date(checkOut);

        let bookedCount = 0;

        if (bookings) {
            Object.values(bookings).forEach((booking) => {
                if (booking.roomName === roomName) {
                    const existingCheckIn = new Date(booking.checkIn);
                    const existingCheckOut = new Date(booking.checkOut);

                    // 🔥 Check overlap
                    if (
                        newCheckIn < existingCheckOut &&
                        newCheckOut > existingCheckIn
                    ) {
                        bookedCount++;
                    }
                }
            });
        }

        const totalRooms = ROOM_INVENTORY[roomName] || 1;

        // 🚨 Check if rooms available
        if (bookedCount >= totalRooms) {
            return res.status(400).json({
                success: false,
                message: "No rooms available for selected dates ❌",
            });
        }

        // ✅ Save booking
        const bookingRef = await bookingsRef.push({
            roomName,
            pricePerNight,
            totalPrice,
            checkIn,
            checkOut,
            adults,
            children,
            userPhone,
            name,
            paymentId: razorpay_payment_id,
            orderId: razorpay_order_id,
            status: "confirmed",
            createdAt: new Date().toISOString(),
        });

        res.json({
            success: true,
            bookingId: bookingRef.key,
            remainingRooms: totalRooms - bookedCount - 1,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message,
        });
    }
});


// 🔍 Check Availability API
app.post("/check-availability", async (req, res) => {
    try {
        const { roomName, checkIn, checkOut } = req.body;

        const bookingsRef = db.ref("bookings");
        const snapshot = await bookingsRef.once("value");
        const bookings = snapshot.val();

        const newCheckIn = new Date(checkIn);
        const newCheckOut = new Date(checkOut);

        let bookedCount = 0;

        if (bookings) {
            Object.values(bookings).forEach((booking) => {
                if (booking.roomName === roomName) {
                    const existingCheckIn = new Date(booking.checkIn);
                    const existingCheckOut = new Date(booking.checkOut);

                    if (
                        newCheckIn < existingCheckOut &&
                        newCheckOut > existingCheckIn
                    ) {
                        bookedCount++;
                    }
                }
            });
        }

        const totalRooms = ROOM_INVENTORY[roomName] || 1;
        const availableRooms = totalRooms - bookedCount;

        res.json({
            success: true,
            availableRooms,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});



app.post("/check-user", async (req, res) => {
    try {
        const { phone } = req.body;

        const snapshot = await db.ref("users").once("value");
        const users = snapshot.val();

        let foundUser = null;

        if (users) {
            Object.entries(users).forEach(([key, user]) => {
                if (user.phone === phone) {
                    foundUser = { id: key, ...user };
                }
            });
        }

        res.json({
            exists: !!foundUser,
            user: foundUser,
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



app.post("/create-user", async (req, res) => {
    try {
        const { name, phone } = req.body;

        const userRef = await db.ref("users").push({
            name,
            phone,
            createdAt: new Date().toISOString(),
        });

        res.json({
            success: true,
            userId: userRef.key,
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 💳 Create Order
app.post("/create-order", async (req, res) => {
    try {
        const { amount, name, phone, description } = req.body;

        const options = {
            amount: 100, // ₹ → paise
            currency: "INR",
            receipt: "receipt_" + Date.now(),
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            order,
            keyId: process.env.RAZORPAY_KEY_ID,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});



// 📜 Get User Bookings
app.get("/user-bookings/:phone", async (req, res) => {
    try {
        const { phone } = req.params;

        const snapshot = await db.ref("bookings").once("value");
        const bookings = snapshot.val();

        let userBookings = [];

        if (bookings) {
            Object.entries(bookings).forEach(([id, booking]) => {
                if (booking.userPhone === phone) {
                    userBookings.push({
                        id,
                        ...booking,
                    });
                }
            });
        }

        // 🔽 Sort latest first
        userBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            bookings: userBookings,
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
