const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const app = express();

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
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  try {
    const response = await fetch(url);
    const html = await response.text();

    if (!response.ok) {
      console.error(
        `Error fetching the url: ${url}`,
        response.status,
        response.statusText
      );
      return res
        .status(response.status)
        .json({ error: "Failed to fetch the requested URL" });
    }

    const cacheControl =
      response.headers.get("cache-control") || "public, max-age=3600";

    const $ = cheerio.load(html);
    const metadata = {
      title: $('meta[property="og:title"]').attr("content") || null,
      description: $('meta[property="og:description"]').attr("content") || null,
      image: $('meta[property="og:image"]').attr("content") || null,
    };
    res.set("Cache-Control", cacheControl);
    res.json(metadata);
  } catch (error) {
    console.error("Error fetching the URL:", error);
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

module.exports = app;
