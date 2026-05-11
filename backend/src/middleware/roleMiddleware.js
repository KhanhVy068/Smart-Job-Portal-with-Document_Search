const isEmployer = (req, res, next) => {
    if (req.user && req.user.role === 'employer') {
        next();
    } else {
        res.status(403).json({ message: 'Bạn không có quyền truy cập. Yêu cầu role: employer' });
    }
};

const isCandidate = (req, res, next) => {
    if (req.user && req.user.role === 'candidate') {
        next();
    } else {
        res.status(403).json({ message: 'Bạn không có quyền truy cập. Yêu cầu role: candidate' });
    }
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Bạn không có quyền truy cập. Yêu cầu role: admin' });
    }
};

module.exports = { isEmployer, isCandidate, isAdmin };