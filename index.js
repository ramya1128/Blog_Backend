const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const multer = require('multer');
const path = require('path');
const dotenv = require("dotenv");
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
dotenv.config();
const app = express();
const PORT = 4000;
const MONGO_URI = "mongodb+srv://ramyaS:fELsTgnrzzXlRnbH@blog.rfvwszw.mongodb.net/?retryWrites=true&w=majority&appName=blog";
const DB_NAME = "Main_Blog";
const APPLICATION_URL="http://localhost:3000";
const SECRET_KEY = process.env.SECRET_KEY || "ramya1128"; 

app.use(
  cors({
    origin: APPLICATION_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use('/uploads', express.static("uploads"));
app.use(bodyParser.json());

// Connect to MongoDB
mongoose
  .connect(MONGO_URI + DB_NAME)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Failed to connect to MongoDB:", err));

// User Schema and Model
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  portfolio: { type: String, default: "" },
  profilePicture: { type: String, default: "" },
});
const User = mongoose.model("User", UserSchema);

// Subscription Schema and Model
const SubscriptionSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  subscribedAt: { type: Date, default: Date.now },
  emailSent: { type: Boolean, default: false },
});
const Subscription = mongoose.model("Subscription", SubscriptionSchema);
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,  // Add your email in .env
    pass: process.env.EMAIL_PASS,  // Add app password in .env
  },
});

// Middleware to Verify JWT Tokens
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Access denied, token missing!" });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token!" });
    req.user = user;
    next();
  });
};

// User Registration Endpoint
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: "Username or Email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();
    res.status(200).json({ message: "Registration successful" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Failed to register user" });
  }
});

// User Login Endpoint
app.post("/login", async (req, res) => {
  const { usernameOrEmail, password } = req.body;

  try {
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ message: "Both username/email and password are required" });
    }

    const user = await User.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid username/email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid username/email or password" });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user._id, username: user.username, email: user.email }, SECRET_KEY, {
      expiresIn: "1h",
    });

    res.status(200).json({
      message: "Login successful",
      token,
      username: user.username,
      email: user.email,
      portfolio: user.portfolio,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Failed to login" });
  }
});

// Profile Endpoint (Get User Profile)
app.get('/profile', authenticateToken, async (req, res) => {
  const { username } = req.query;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const blogsCount = await Blog.countDocuments({ author: username });

    res.status(200).json({
      username: user.username,
      email: user.email,
      portfolio: user.portfolio,
      blogsCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching profile' });
  }
});

// Update User Profile
app.put('/profile', authenticateToken, async (req, res) => {
  const { username, portfolio } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    user.portfolio = portfolio;
    await user.save();

    res.status(200).json({ message: 'Profile updated successfully', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Subscription Endpoint
app.post('/subscribe', async (req, res) => {
  const { email } = req.body;

  try {
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const existingSubscription = await Subscription.findOne({ email });
    if (existingSubscription) {
      return res.status(400).json({ error: 'You are already subscribed!' });
    }

    const newSubscription = new Subscription({ email });
    await newSubscription.save();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Welcome to Vibrant Blog!",
      text: "Welcome to the Vibrant Blog! Thanks for subscribing.",
    };

    transporter.sendMail(mailOptions, async (error,info) => {
      if (error) return res.status(500).json({ error: "Failed to send email" });

      newSubscription.emailSent = true;
      await newSubscription.save();

    res.status(200).json({ message: 'Subscription successful! Confirmation Email sent' });
  });
 } catch (err) {
    console.error('Subscription error:', err);
    res.status(500).json({ error: 'Failed to subscribe. Please try again later.' });
  }
});

// Blog Schema and Model
const BlogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: String, required: true },
  category: { type: String, required: true },
  externalLink: { type: String, required: false },
  image: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
});
const Blog = mongoose.model('Blog', BlogSchema);

const storage = multer.diskStorage({
  destination: './uploads', // Folder to store images
  filename: (req, file, cb) => {
    cb(null,Date.now() + path.extname(file.originalname));
  },
});

// Initialize upload
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extName = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const mimeType = fileTypes.test(file.mimetype);
    if (mimeType && extName) return cb(null, true);
    cb(new Error('Only images are allowed (jpeg, jpg, png, gif)'));
  },
});

// Create Blog Route
app.post('/blogs/create', authenticateToken,upload.single('image'), async (req, res) => {
  const { title, content, author, category, externalLink } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  if (!title || !content || !author || !category) {
    return res.status(400).json({ message: 'Please fill all the required fields' });
  }

  const validCategories = ["Technology", "Health", "Lifestyle", "Education", "Business","Entertainment"];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ message: 'Invalid category selected' });
  }

  try {
    const newBlog = new Blog({
      title,
      content,
      author, // Use the author (username) from the request body
      category,
      externalLink,
      image,
    });

    await newBlog.save();
    res.status(200).json({ message: 'Blog created successfully', blog: newBlog });
  } catch (error) {
    console.error('Error creating blog:', error);
    res.status(500).json({ message: 'Error creating blog, please try again' });
  }
});

// Get all blogs
app.get('/blogs', async (req, res) => {
  try {
    const blogs = await Blog.find();
    res.status(200).json({ blogs });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching blogs' });
  }
});

// Update Blog Route
app.put("/update-blog/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, content, category, externalLink } = req.body;

  try {
    const updatedBlog = await Blog.findByIdAndUpdate(id, { title, content, category, externalLink }, { new: true });
    if (!updatedBlog) return res.status(404).json({ message: "Blog not found" });
    res.status(200).json({ message: "Blog updated successfully", blog: updatedBlog });
  } catch (error) {
    res.status(500).json({ message: "Failed to update blog" });
  }
});

// Delete Blog Route
app.delete("/delete-blog/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const deletedBlog = await Blog.findByIdAndDelete(id);
    if (!deletedBlog) return res.status(404).json({ message: "Blog not found" });
    res.status(200).json({ message: "Blog deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete blog" });
  }
});

// Like Blog Route
/*app.post('/blogs/like/:id', authenticateToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).send('Blog not found');
    }
    blog.likes += 1;
    await blog.save();
    res.status(200).json({ likes: blog.likes, unlikes: blog.unlikes });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

// Unlike Blog Route
app.post('/blogs/unlike/:id', authenticateToken, async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).send('Blog not found');
    }
    blog.unlikes += 1;
    await blog.save();
    res.status(200).json({ likes: blog.likes, unlikes: blog.unlikes });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});*/

// Start the Server
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
