const express = require('express')
require('dotenv').config();
const { v4: uuid } = require("uuid")
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const multer = require('multer')
const path = require('path');

const app = express()

app.use(express.json({ extended: false }))
app.use(express.static('./views'))
app.set('view engine', 'ejs')
app.set('views', './views')


const config = {
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}

const dynamoClient = new DynamoDBClient(config)
const s3Client = new S3Client(config)

const documentClient = DynamoDBDocumentClient.from(dynamoClient);
const tableName = 'SanPham'


const storage = multer.memoryStorage({
  destination(req, file, callback) {
    callback(null, '');
  }
})

function checkFileType(file, cb) {
  const fileTypes = /jpeg|jpg|png|gif/;
  const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = fileTypes.test(file.mimetype);
  if (extname && mimetype) {
    return cb(null, true);
  }
  return cb("Error: Image only");
}

const upload = multer(
  {
    storage,
    limits: { fileSize: 2000000 },
    fileFilter(req, file, cb) {
      checkFileType(file, cb)
    }
  })


const CLOUD_FRONT_URL = process.env.CLOUD_FRONT_URL

app.post('/', upload.single('image'), async (req, res) => {
  const { ma_sp, ten_sp, so_luong } = req.body
  if (!req.file) {
    return res.status(400).send('No image uploaded');
  }

  const image = req.file.originalname.split(".");
  const fileType = image[image.length - 1];
  const filePath = `${uuid()}-${Date.now()}.${fileType}`;

  const s3Params = {
    Bucket: "huynhthu-lab7",
    Key: filePath,
    Body: req.file.buffer,
    ContentType: req.file.mimetype,
  };

  const newItem = {
    TableName: tableName,
    Item: {
      ma_sp: parseInt(ma_sp) || 0,
      ten_sp,
      so_luong: parseInt(so_luong) || 0,
      image_url: `${CLOUD_FRONT_URL}/${filePath}`
    }
  };

  try {
    const s3Command = new PutObjectCommand(s3Params);
    await s3Client.send(s3Command);

    const dynamoCommand = new PutCommand(newItem);
    await documentClient.send(dynamoCommand);

    return res.redirect('/');
  } catch (err) {
    console.error('Upload Error:', err);
    return res.status(500).send('Internal Server Error');
  }
})

app.get('/', async (req, res) => {
  const params = {
    TableName: tableName,
  };

  try {
    const command = new ScanCommand(params);
    const data = await documentClient.send(command);
    console.log(data.Items);
    return res.render('index', { sanPhams: data.Items });
  } catch (err) {
    console.error(err);
    res.send('Internal Server Error');
  }
});

app.post('/delete', upload.fields([]), async (req, res) => {
  const ids = req.body.ids;
  if (!ids || ids.length === 0) {
    return res.redirect('/');
  }
  try {
    for (const ma_sp of ids) {
      const params = {
        TableName: tableName,
        Key: {
          ma_sp: parseInt(ma_sp)
        }
      };
      const command = new DeleteCommand(params);
      await documentClient.send(command);
    }
    return res.redirect('/');
  } catch (err) {
    console.error(err);
    return res.send('Internal Server Error');
  }
});

app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
