import { Request, Response, NextFunction } from 'express';
import { supabaseAuthClient } from '../database';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7);

    const {
      data: { user },
      error,
    } = await supabaseAuthClient.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // user.email can be null depending on provider; guard it
    if (!user.email) {
      res.status(401).json({ error: 'User email not available' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
};