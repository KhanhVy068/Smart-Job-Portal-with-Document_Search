const searchService = require('../services/searchService');

exports.search = async (req, res) => {
  try {
    const result = await searchService.search({
      q: req.query.q || req.query.keyword || '',
      type: req.query.type || 'all',
      location: req.query.location || '',
      page: req.query.page,
      limit: req.query.limit
    });
    res.json(result);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Lỗi tìm kiếm full-text', error: error.message });
  }
};

exports.reindex = async (req, res) => {
  try {
    const result = await searchService.reindexAll();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Reindex error:', error);
    res.status(500).json({ message: 'Lỗi đồng bộ chỉ mục tìm kiếm', error: error.message });
  }
};
