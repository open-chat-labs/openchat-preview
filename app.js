const express = require("express");
const cors = require("cors");
const app = express();
const ogpParser = require("ogp-parser");
const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 3600 });

const whitelist = [
  "http://localhost:5001",
  "https://oc.app",
  "https://test.oc.app",
  "https://webtest.oc.app",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} is not permitted`));
    }
  },
};

app.use(cors(corsOptions));
app.get("/preview", async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: "URL parameter is required" });
  }

  try {
    const callerOrigin = req.headers.origin || req.headers.referer;
    if (callerOrigin) {
      try {
        const callerUrl = new URL(callerOrigin);
        const targetUrl = new URL(url);

        // if the origins match then this is an OC url for which we cannot return meaningful meta data
        if (callerUrl.origin === targetUrl.origin) {
          return res.status(404).json({
            error:
              "We cannot return meaningful metadata for internal links (yet)",
          });
        }
      } catch (error) {
        console.warn("Failed to parse URL for origin check:", error);
      }
    }

    const cachedMetadata = cache.get(url);
    if (cachedMetadata) {
      console.log("Returning OpenGraph metadata from cache for ", url);
      res.set("Cache-Control", "public, max-age=3600");
      return res.json(cachedMetadata);
    }
    const metadata = await ogpParser(url);
    if (!metadata) {
      console.log("OpenGraph metadata not found", url);
      return res.status(404).json({ error: "OpenGraph metadata not found" });
    }

    const data = {
      title: metadata.title,
      description: metadata.ogp["og:description"],
      image: metadata.ogp["og:image"],
      imageAlt: metadata.ogp["og:image:alt"],
    };

    cache.set(url, data);
    res.set("Cache-Control", "public, max-age=3600"); // Cache for 1 hour
    return res.json(data);
  } catch (error) {
    console.error("Error getting OpenGraph metadata", url, error);
    return res
      .status(500)
      .json({ error: `Error getting OpenGraph metadata for ${url}` });
  }
});

module.exports = app;
