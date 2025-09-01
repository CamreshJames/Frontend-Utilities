const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

// Serve static files
app.use(express.static("public"));

// Proxy to correct OData root
app.use(
  "/odata",
  createProxyMiddleware({
    target: "https://services.odata.org/V4/TripPinService",
    changeOrigin: true,
    pathRewrite: { "^/odata": "" }, // remove /odata prefix
    logLevel: "debug",
  })
);

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
