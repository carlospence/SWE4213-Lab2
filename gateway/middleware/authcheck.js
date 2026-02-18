const jwt = require("jsonwebtoken");

// Note: We should never expose our secret key in the code
const SECRET_KEY = process.env.JWT_SECRET;

function authcheck(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: "Missing Authorization header" });

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
        return res.status(401).json({ error: "Use Authorization: Bearer <token>" });
    }

    try {
        const payload = jwt.verify(token, SECRET_KEY);
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

module.exports = authcheck;