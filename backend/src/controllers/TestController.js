const getProfile = async (req, res) => {
    res.json({
        message: 'Đây là route yêu cầu đăng nhập',
        user: req.user
    });
};

const getEmployerOnly = async (req, res) => {
    res.json({
        message: 'Chỉ Employer mới thấy được route này',
        user: req.user
    });
};

const getCandidateOnly = async (req, res) => {
    res.json({
        message: 'Chỉ Candidate mới thấy được route này',
        user: req.user
    });
};

const getAdminOnly = async (req, res) => {
    res.json({
        message: 'Chỉ Admin mới thấy được route này',
        user: req.user
    });
};

module.exports = { getProfile, getEmployerOnly, getCandidateOnly, getAdminOnly };