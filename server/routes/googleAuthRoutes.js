import express from 'express';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import { generateToken } from '../controllers/authController.js';

const googleRouter = express.Router();

const oAuth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'postmessage',
);

googleRouter.post('/google', async (req, res) => {
  console.log('Google router');
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: 'Google auth code is required' });
    }

    const { tokens } = await oAuth2Client.getToken(code);
    const idToken = tokens.id_token;

    if (!idToken) {
      return res.status(400).json({ message: 'Failed to retrieve ID token from Google' });
    }

    const ticket = await oAuth2Client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
        return res.status(400).json({ message: 'Failed to retrieve user information from Google' });
    }

    let user = await User.findOne({ email: payload.email });
    console.log("User Data ---",payload)
    if (!user) {
      user = await User.create({
        email: payload.email,
        role: 'user',
        name: payload.name,
        avatar: payload.picture,
        // You might want to handle password differently for OAuth users
        // For now, we can generate a random one as it won't be used for login
        password: Math.random().toString(36).slice(-8),
      });
    }

    res.json({
      _id: user._id,
      email: user.email,
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Google OAuth Error:', error);
    res.status(500).json({ message: 'Server error during Google authentication' });
  }
});

export default googleRouter;