const express = require("express");
const cors = require("cors");
const app = express();
const ogpParser = require("ogp-parser");
const { LRUCache } = require("lru-cache");
const { URL } = require("url");

const whitelist = [
  "http://localhost:5001",
  "https://oc.app",
  "https://test.oc.app",
  "https://webtest.oc.app",
];

// Create an LRU cache with a max size of 10000 items or 1 GB
const cache = new LRUCache({
  max: 5000,
  maxSize: 500 * 1024 * 1024,
  sizeCalculation: (value, key) => JSON.stringify(value).length + key.length,
  ttl: 3600 * 1000, // 1 hour
});

const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} is not permitted`));
    }
  },
};

const badResponse = { badResponse: true };

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms)
    ),
  ]);

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

        if (targetUrl.protocol !== "https:") {
          return res
            .status(400)
            .json({ error: "Only HTTPS URLs are supported" });
        }

        // if the origins match then this is an OC url for which we cannot return meaningful meta data
        if (callerUrl.origin === targetUrl.origin) {
          const msg = `We cannot return meaningful metadata for internal links (yet): ${url}`;
          console.warn(msg);
          return res.status(404).json({
            error: msg,
          });
        }
      } catch (error) {
        console.warn("Failed to parse URL for origin check:", error);
        return res
          .status(400)
          .json({ error: "Failed to parse URL for origin check:" });
      }
    }

    const cachedData = cache.get(url);

    if (cachedData?.badResponse) {
      return res.status(404).json({ error: "OpenGraph metadata not found" });
    }

    if (cachedData) {
      console.debug("Returning OpenGraph metadata from cache for ", url);
      res.set("Cache-Control", "public, max-age=3600");
      return res.json(cachedData);
    }

    const metadata = await withTimeout(ogpParser(url), 5000);
    if (!metadata) {
      cache.set(url, badResponse);
      console.debug("OpenGraph metadata not found", url);
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
    cache.set(url, badResponse);
    return res
      .status(500)
      .json({ error: `Error getting OpenGraph metadata for ${url}` });
  }
});

// Let's see if we can spot what's happening with the memory
setInterval(() => {
  try {
    const used = process.memoryUsage();
    console.debug(
      `Heap: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB / ${(
        used.heapTotal /
        1024 /
        1024
      ).toFixed(2)} MB`
    );
  } catch (err) {
    console.error(err);
  }
}, 60000); // Every minute

module.exports = app;
