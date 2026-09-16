var path = require('path');
var express = require('express');
var router = express.Router();

var PUBLIC_DIR = path.join(__dirname, '..', 'public');

// The three landings are plain static pages (PRD §4.1) — no view engine here.
// Paths are resolved once at startup into a fixed lookup, so no filesystem path
// is ever assembled from request data: the route only serves what is listed.
var LANDINGS = {
  v1: path.join(PUBLIC_DIR, 'v1', 'index.html'),
  v2: path.join(PUBLIC_DIR, 'v2', 'index.html'),
  v3: path.join(PUBLIC_DIR, 'v3', 'index.html')
};

// Explicit routes so /v1 works as well as /v1/.
Object.keys(LANDINGS).forEach(function (version) {
  var file = LANDINGS[version];

  router.get('/' + version, function (req, res, next) {
    res.sendFile(file, function (err) {
      if (err) next(err);
    });
  });
});

// No landing is picked yet — /v1, /v2 and /v3 are compared before arbitration
// (PRD §1.1). Until then the root points at the first one.
router.get('/', function (req, res) {
  res.redirect('/v1');
});

module.exports = router;
