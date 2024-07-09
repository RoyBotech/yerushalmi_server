require("dotenv").config();
const express = require("express");
const connectDB = require("./mongoose");
const authenticateToken = require("./authenticateToken");
const cors = require("cors");
const DiamondNew = require("./models/diamondNew");
const Color = require("./models/color");
const Shape = require("./models/shape");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const csv = require("csv-parser");
const FTPClient = require("ftp");
const path = require("path");
const moment = require("moment");

const app = express();
connectDB();
app.use(express.json());
app.use(cors());

// FTP configuration
const ftpConfig = {
  host: "206.81.26.56",
  user: "ftpuser",
  password: "ftpuser1",
};

// Path to the directory containing the CSV files on the FTP server (root directory)
// const ftpDirPath = "/home/ftpuser/vegas stones csv.csv";

// Local path to save the downloaded CSV file
const localCsvPath = path.join(__dirname, "/data_ftp/data_new.csv"); // Ensure the file is saved in the current directory

// Function to download CSV file from FTP and save locally
// function downloadCsvFromFTP(callback) {
//   const client = new FTPClient();

//   client.on("ready", () => {
//     client.get(ftpDirPath, (err, stream) => {
//       if (err) {
//         console.error("Error downloading file from FTP:", err);
//         client.end();
//         return callback(err);
//       }

//       const writeStream = fs.createWriteStream(localCsvPath);

//       stream.once("close", () => {
//         console.log(`Downloaded file ${ftpDirPath} successfully`);
//         client.end();
//         callback();
//       });

//       stream.pipe(writeStream);
//       // stream.pipe(fs.createWriteStream(localCsvPath));
//       writeStream.on("error", (err) => {
//         console.error("Error writing to local file:", err);
//         client.end();
//         callback(err);
//       });
//     });
//   });

//   client.on("error", (err) => {
//     console.error("FTP client error:", err);
//   });
//   client.connect(ftpConfig);
// }

// Function to sanitize the file name
function sanitizeFileName(name) {
  return name.replace(/\./g, "").replace(/[^a-zA-Z0-9-_]/g, "");
}

// Function to download the most recent CSV file from FTP and save locally
function downloadLatestCsvFromFTP(callback) {
  const client = new FTPClient();

  client.on("ready", () => {
    client.list((err, list) => {
      if (err) {
        console.error("Error listing files on FTP:", err);
        client.end();
        return callback(err);
      }

      // Sort files by modification time
      list.sort((a, b) => moment(b.date).valueOf() - moment(a.date).valueOf());

      // Get the most recent file
      const latestFile = list[0].name;

      console.log(`Downloading latest file: ${latestFile}`);

      client.get(latestFile, (err, stream) => {
        if (err) {
          console.error("Error downloading file from FTP:", err);
          client.end();
          return callback(err);
        }

        const writeStream = fs.createWriteStream(localCsvPath);

        stream.once("close", () => {
          console.log(`Downloaded file ${latestFile} successfully`);
          client.end();
          callback();
        });

        stream.pipe(writeStream);

        // Handle errors during writing
        writeStream.on("error", (err) => {
          console.error("Error writing to local file:", err);
          client.end();
          callback(err);
        });
      });
    });
  });

  client.on("error", (err) => {
    console.error("FTP client error:", err);
  });

  client.connect(ftpConfig);
}

// Read the HTML template
const templatePath = path.join(__dirname, "../yerushalmi/docs/template.html");
const template = fs.readFileSync(templatePath, "utf-8");
// console.log("Template Path:", templatePath);

// Function to replace placeholders with actual data
function generateHtml(data) {
  console.log("data:", data);

  let html = template;
  Object.keys(data).forEach((key) => {
    const placeholder = `\${diamond.${key}}`;
    const value = data[key];
    // Replace the placeholder with the corresponding value, handling special characters
    html = html.split(placeholder).join(value || "");
  });
  return html;
}

// Function to process the CSV file and save data to MongoDB
function processCsvAndSaveToMongo() {
  const results = [];

  fs.createReadStream(localCsvPath)
    .pipe(csv())
    .on("data", (row) => {
      // Map CSV fields to MongoDB fields
      const mappedRow = {
        VendorStockNumber: row["VendorStockNumber"],
        Shape: row["Shape"],
        Weight: row["Weight"],
        Color: row["Color"],
        Clarity: row["Clarity"],
        Cut: row["Cut"],
        Polish: row["Polish"],
        Symmetry: row["Symmetry"],
        FluorescenceIntensity: row["FluorescenceIntensity"],
        Lab: row["Lab"],
        ROUGH_CT: row["ROUGH CT"], // Map "ROUGH CT" to "ROUGH_CT"
        ROUGH_DATE: row["ROUGH DATE"], // Map "ROUGH DATE" to "ROUGH_DATE"
        CertificateUrl: row["CertificateUrl"] || "-",
        RoughVideo: row["Rough Video"], // Map "Rough Video" to "RoughVideo"
        PolishedVideo: row["Polished Video"], // Map "Polished Video" to "PolishedVideo"
      };

      mappedRow.HTMLTemplate = generateHtml(mappedRow); // Generate and save the HTML template
      results.push(mappedRow);
    })
    .on("end", async () => {
      try {
        await DiamondNew.insertMany(results);
        console.log("Data successfully saved to MongoDB");
      } catch (error) {
        console.error("Error saving data to MongoDB:", error);
      }
    });
}

// Endpoint to get a diamond by VendorStockNumber and generate HTML
app.post("/yerushalmi/diamond/html", authenticateToken, async (req, res) => {
  const { VendorStockNumber } = req.body;

  if (!VendorStockNumber) {
    return res.status(400).json({ message: "VendorStockNumber is required" });
  }

  try {
    const diamond = await DiamondNew.findOne({ VendorStockNumber }).lean();
    if (!diamond) {
      return res.status(404).json({ message: "Diamond not found" });
    }

    // Generate HTML if not already present
    if (!diamond.HTMLTemplate) {
      diamond.HTMLTemplate = generateHtml(diamond);
      await DiamondNew.updateOne(
        { _id: diamond._id },
        { HTMLTemplate: diamond.HTMLTemplate }
      );
    }

    // Define the path for the HTML file
    const htmlFilePath = path.join(
      __dirname,
      `../yerushalmi/docs/${VendorStockNumber}_NEW.html`
    );

    // Write the HTML file to the specified path
    fs.writeFileSync(htmlFilePath, diamond.HTMLTemplate, "utf-8");

    res.send(diamond.HTMLTemplate); // Send the generated HTML as the response
  } catch (error) {
    console.error("Error generating HTML:", error);
    res.status(500).json({ message: error.message });
  }
});
// Endpoint to generate HTML templates for multiple diamonds
app.post(
  "/yerushalmi/diamond/generateHtmlTemplates",
  authenticateToken,
  async (req, res) => {
    const { vendorStockNumbers } = req.body;

    if (!Array.isArray(vendorStockNumbers) || vendorStockNumbers.length === 0) {
      return res
        .status(400)
        .json({ message: "VendorStockNumbers should be a non-empty array" });
    }

    try {
      const diamonds = await DiamondNew.find({
        VendorStockNumber: { $in: vendorStockNumbers },
      }).lean();

      for (const diamond of diamonds) {
        // Generate HTML if not already present
        if (!diamond.HTMLTemplate) {
          diamond.HTMLTemplate = generateHtml(diamond);
          await DiamondNew.updateOne(
            { _id: diamond._id },
            { HTMLTemplate: diamond.HTMLTemplate }
          );
        }
        // Sanitize the filename
        const sanitizedFileName = sanitizeFileName(
          `${diamond.VendorStockNumber}_NEW`
        );
        // Define the path for the HTML file
        const htmlFilePath = path.join(
          __dirname,
          `../yerushalmi/docs/${sanitizedFileName}.html`
        );

        // Write the HTML file to the specified path
        fs.writeFileSync(htmlFilePath, diamond.HTMLTemplate, "utf-8");
      }

      res.json({ message: "HTML templates generated and saved successfully" });
    } catch (error) {
      console.error("Error generating HTML templates:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

// app.post("/yerushalmi/diamond/getHtmlTemplate", authenticateToken, async (req, res) => {
//   const { VendorStockNumber } = req.body;

//   if (!VendorStockNumber) {
//     return res.status(400).json({ message: "VendorStockNumber is required" });
//   }

//   try {
//     const diamond = await DiamondNew.findOne({ VendorStockNumber }).lean();
//     if (!diamond) {
//       return res.status(404).json({ message: "Diamond not found" });
//     }

//     if (!diamond.HTMLTemplate) {
//       return res.status(404).json({ message: "HTMLTemplate not found for the specified diamond" });
//     }

//     res.json({ HTMLTemplate: diamond.HTMLTemplate });
//   } catch (error) {
//     console.error("Error fetching HTML template:", error);
//     res.status(500).json({ message: error.message });
//   }
// });

// Endpoint to trigger the FTP download and save to MongoDB
app.post("/yerushalmi/import-diamonds", authenticateToken, (req, res) => {
  downloadLatestCsvFromFTP(() => {
    processCsvAndSaveToMongo();
    res
      .status(200)
      .json({ message: "FTP download initiated and data is being processed" });
  });
});

// generate token
app.post("/yerushalmi/generate-token", (req, res) => {
  const user = { id: 1, username: "testuser" }; // Example payload
  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
  res.json({ token });
});

app.get("/yerushalmi/data", authenticateToken, async (req, res) => {
  try {
    const data = await DiamondNew.find();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//get all the diamond
app.get("/yerushalmi/diamonds", authenticateToken, async (req, res) => {
  console.log("res:", res);
  const { search, sort } = req.query;
  try {
    let query = {};
    if (search) {
      query = { ...query, dataField: { $regex: search, $options: "i" } };
    }
    let data = DiamondNew.find(query);

    if (sort) {
      const sortField = sort.split(":");
      data = data.sort({ [sortField[0]]: sortField[1] === "desc" ? -1 : 1 });
    }
    data = await data.exec();
    res.json(data);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ message: error.message });
  }
});

// Endpoint to delete all documents from the diamonds_new collection
app.delete("/yerushalmi/diamonds", authenticateToken, async (req, res) => {
  try {
    await DiamondNew.deleteMany({});
    res.status(200).json({ message: "All diamonds deleted successfully" });
  } catch (error) {
    console.error("Error deleting diamonds:", error);
    res
      .status(500)
      .json({ message: "Failed to delete diamonds", error: error.message });
  }
});

// Endpoint to delete all documents from the diamonds_new collection by VendorStockNumber
app.delete("/yerushalmi/diamonds", authenticateToken, async (req, res) => {
  const { vendorStockNumbers } = req.body;

  if (!vendorStockNumbers || !Array.isArray(vendorStockNumbers)) {
    return res
      .status(400)
      .json({
        message: "vendorStockNumbers is required and should be an array",
      });
  }

  try {
    await DiamondNew.deleteMany({
      VendorStockNumber: { $in: vendorStockNumbers },
    });
    res.status(200).json({ message: "Selected diamonds deleted successfully" });
  } catch (error) {
    console.error("Error deleting diamonds:", error);
    res
      .status(500)
      .json({ message: "Failed to delete diamonds", error: error.message });
  }
});

//the all colors from the mongoDB
app.get("/yerushalmi/colors", async (req, res) => {
  try {
    const colors = await Color.find();
    res.json(colors);
  } catch (error) {
    res.status(500).json({ message: "Error fetching colors", error });
  }
});

//The all shapes from the mongoDB
app.get("/yerushalmi/shapes", async (req, res) => {
  try {
    const shapes = await Shape.find();
    res.json(shapes);
  } catch (error) {
    res.status(500).json({ message: "Error fetching colors", error });
  }
});

// Endpoint to create a new diamond item
app.post("/yerushalmi/diamonds", async (req, res) => {
  const {
    VendorStockNumber,
    Shape,
    Weight,
    Color,
    Clarity,
    Cut,
    Polish,
    Symmetry,
    FluorescenceIntensity,
    Lab,
    ROUGH_CT,
    ROUGH_DATE,
    CertificateUrl,
    RoughVideo,
    PolishedVideo,
  } = req.body;

  try {
    const newDiamond = new DiamondNew({
      VendorStockNumber,
      Shape,
      Weight,
      Color,
      Clarity,
      Cut,
      Polish,
      Symmetry,
      FluorescenceIntensity,
      Lab,
      ROUGH_CT,
      ROUGH_DATE,
      CertificateUrl,
      RoughVideo,
      PolishedVideo,
    });

    await newDiamond.save();
    res.status(201).json(newDiamond);
  } catch (error) {
    console.error("Error creating diamond:", error);
    res
      .status(500)
      .json({ message: "Failed to create diamond", error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
