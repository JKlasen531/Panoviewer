let express = require("express");
let http_server = require("http").Server(express());
let io_server = require("socket.io")(http_server);

let app = express();
let http_publisher = require("http").Server(app);
let io_publisher = require("socket.io")(http_publisher);

// setting express
app.use(express.static(__dirname + "/3dpano"));

// render browser
app.get("/", function (req, res) {
  res.sendFile(__dirname + "/3dpano/online3DPano.html");
});

let extractFrames = require('ffmpeg-extract-frames'); //rm
let fs = require("fs");//file system
let path = require("path");

let keyframeMap = new Map();
let imageSet = new Set();

//the server connecting with OpenVSlam
io_server.on("connection", (socket) => {
    console.log(`OpenVSlam connected - ID: ${socket.id}`);
    openvslamConnected = true;
  
    /*msg with the event name map_publish contains useful information
    / about keyframes; we send it to the website client and
    / decode the message on the server side as well
    */
    socket.on("map_publish", (msg) => {
        io_publisher.emit("map_publish", msg);
        decodeMapMsg(msg).catch(err => console.log("errDecode: " + err));
    });
  
    /*this message contains the path to the video file
    / openvslam is currently running with; we save it 
    / so we have the source when we need to save the images
    */
    socket.on("video file", (msg) => {
        decodeVideoMsg(msg).catch(err => console.log("errVideosAndJson: " + err));
    });
  
    socket.on("status", (msg) => {
        decodeStatusMsg(msg).catch(err => console.log("errProtobufError: " + err));
    });
  
    socket.on("disconnect", () => {
        console.log(`OpenVSlam disconnected - ID: ${socket.id}`);
        openvslamConnected = false;
    });
});

let protobuf = require('protobufjs');
let atob = require('atob');

/* decodes the msg via the protobuf file, and sends its components
/  to other methods, for logging the keyframes, and creating
/  images corresponding to the keyframe_src_frm_id //! no more image creation
*/
async function decodeMapMsg(msg) {
    const root = await protobuf.load(__dirname + "/3dpano/map_segment.proto");
    const map_segment = root.lookupType("map_segment.map");
    let message = map_segment.decode(base64ToUint8Array(msg));
    let keyframes = [];
    let images = [];
    loadMsgData(message, keyframes, images);
}


/* small method that fills an array of keyframes
/  with keyframes from a decoded message
*/
function loadMsgData(obj, keyframes, images) {
  for (let keyframeObj of obj.keyframes) {
    let keyframe = {};
    keyframe["id"] = keyframeObj.id;
    keyframe["pose"] = keyframeObj.pose;
    keyframe["srcfrmid"] = keyframeObj.srcfrmid;
    keyframes.push(keyframe);
    addKeyframeToMap(keyframe);
  }
  for (let image of obj.images) {
    images.push(image.path);
    addImageToSet(image);
  }
}

function addKeyframeToMap(keyframe) {
  if(keyframe.pose !== null) {
    let jsonString = {};
    jsonString.srcfrmid = keyframe.srcfrmid;
    jsonString.pose = keyframe.pose.pose;
    let json = {
      [keyframe.id]: [jsonString]
    };
    keyframeMap.set(keyframe.id,json);
  } else {
    if(keyframeMap.has(keyframe.id)) {
      keyframeMap.delete(keyframe.id);
    }
  }
}

function addImageToSet(image) {
  imageSet.add(path.basename(image.path));
}

/* decodes the message via protobuf into a readable string
*/
async function decodeVideoMsg(msg) {
  const root = await protobuf.load(__dirname + "/3dpano/map_segment.proto");
  const map_segment = root.lookupType("map_segment.map");
  let message = map_segment.decode(base64ToUint8Array(msg));
  loadVideoFileAndJson(message);
}

function loadVideoFileAndJson(msg) {
  if(msg.messages[0].tag === "videoSlam") {
      let videoFilePath = path.normalize(msg.messages[0].txt);
      imgOutputPath = path.normalize(msg.messages[2].txt);
      if (imgOutputPath.charAt(imgOutputPath.length -1) == "/") {
          imgOutputPath = imgOutputPath.substring(0, imgOutputPath.length -1);
      }
      // check before if imgoutputpath exists
      app.get(imgOutputPath + "/*", (req, res) => {
          res.sendFile(req.originalUrl);
      });
      fps = Math.round(parseInt(msg.messages[3].txt)/100.0)/parseInt(msg.messages[4].txt);
      if(websiteConnected) {
          io_publisher.emit("fps", fps);
      }
      checkLowResVideo(videoFilePath, imgOutputPath);
  }
  else if(msg.messages[0].tag === "cameraSlam") {
      // not sure if this works, didnt test cameraslam
      let today = new Date();

      let dir = today.getHours() + ':'+ today.getMinutes() +':' + today.getSeconds() + '_' + today.getFullYear() + '-' + (today.getMonth()+1) + '-' + today.getDate();
      outputFolder = './3dpano/' + 'cameraSlam_' + dir + '/';
      let fps = Math.round(parseInt(msg.messages[3].txt)/100.0)/parseInt(msg.messages[4].txt);
      if(websiteConnected) {
          io_publisher.emit("fps", fps);
      }
      imgOutputPath = msg.messages[2].txt;
      //createLogs(outputFolder, imgOutputPath);
      app.get(imgOutputPath + "/*", (req, res) => {
          res.sendFile(req.originalUrl);
      });
  }
}

/* no clue what this does, but it is important
/  for decoding protobuf messages; the method
/  is taken from the socket viewer by openvslam
*/
function base64ToUint8Array(base64) {
  let binaryString = atob(base64);
  let len = binaryString.length;
  let bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeStatusMsg(msg) {
    const root = await protobuf.load(__dirname + "/3dpano/map_segment.proto");
    const map_segment = root.lookupType("map_segment.map");
    let message = map_segment.decode(base64ToUint8Array(msg));
    setStatus(message);
}
  
function setStatus(msg) {
    let status = msg.messages[0].txt;
    if(status.includes("openvslam finished")) {
      //create the logs with imageSet and keyframeMap

      //image log
      let imageLog = imgOutputPath + "/images.json";
      let imagesJson = {};
      imagesJson.fps = fps;
      if(smallVideo !== undefined) {
        imagesJson.videoFile = smallVideo;
      }
      let array = new Array(imageSet.size);
      let i = 0;
      imageSet.forEach((value, key, set) => {
        array[i] = value;
        i++;
      });
      imagesJson.images = array;
      let imgLogContent = JSON.stringify(imagesJson);
      fs.appendFile(imageLog, imgLogContent, (err) => {console.log(err)});

      //keyframe log
      let keyframeLog = imgOutputPath + "/keyframes.json";
      let keyframesJson = {};
      let j = 0;
      let keyArray = new Array(keyframeMap.size);
      keyframeMap.forEach((value, key, map) => {
        keyArray[j] = value;
        j++;
      });
      keyframesJson.keyframes = keyArray;
      let keyfrmLogContent = JSON.stringify(keyframesJson);
      fs.appendFile(keyframeLog, keyfrmLogContent, (err) => {console.log(err)});

      if(websiteConnected) {
        io_publisher.emit("status", status + "_" + imgOutputPath);
      }
    }
}

let ffmpeg = require('fluent-ffmpeg');

/* creates a low resolution video of the main video, if
/  it does not exist yet and notifies the clients when
/  the conversion is done.
/  it could be improved by not only checking if a video
/  file with the corresponding name exists, but also
/  checks the playtime of original and the small one.
*/
function checkLowResVideo(input, output) {
    let videoFile = path.parse(input).name;
    let fileEnding = path.parse(input).ext;
    smallVideo = output + "/" + videoFile + "_small" + fileEnding;
    if (!exists(output)) {
      fs.mkdir(output, {recursive: true}, (err) => {
        if(err) throw err;
        createSmallVideo(input, smallVideo,
          (err) => {console.log(err)},
          (progress) => {},
          () => {io_publisher.emit('smallVideo', smallVideo);
        });
      });
    } else {
    if (!exists(smallVideo)) {
      createSmallVideo(input, smallVideo,
        (err) => {console.log(err)},
        (progress) => {},
        () => {io_publisher.emit('smallVideo', smallVideo);
    });
    } else {
        let videoDuration;
        let smallVideoDuration;
        ffmpeg.ffprobe(input, (err, metadata) => {
            videoDuration= (Math.round(metadata.format.duration*10))/10;
            ffmpeg.ffprobe(smallVideo, (err, metadata) => {
              smallVideoDuration = (Math.round(metadata.format.duration*10))/10;
              if (videoDuration !== smallVideoDuration) {
                fs.unlink(smallVideo, (err) => {
                    if (err) console.log(err);
                    else {
                      createSmallVideo(input, smallVideo,
                          (err) => {console.log(err)},
                          (progress) => {},
                          () => {io_publisher.emit('smallVideo', smallVideo);
                      });
                    }
                });
            } else {
                if(websiteConnected) {
                    io_publisher.emit('smallVideo', smallVideo);
                }
            }
          });
        });
    }
  }
}

function createSmallVideo(input, output, callbackError, callbackProgress, callbackFinish) {
    ffmpeg(input)
        .output(output)
        .videoCodec('libx264')
        .noAudio()
        .size('480x?')
        .on('error', (err) => {
            callbackError(err);
        })
        .on('progress', (progress) => {
            io_publisher.emit("smallVideoProgress", progress);
            callbackProgress(progress);
        })
        .on('end', () => {
            callbackFinish();
        })
        .run();
}

let videoFilePath = undefined;
let outputFolder = undefined;
let smallVideo = undefined;
let smallVideoRendering = false;
let openvslamConnected = false;
let websiteConnected = false;
let fps = undefined;

/* small util, that checks if a file or path
/  is accessible
*/
const exists = dir => {
  try {
    fs.accessSync(dir, fs.constants.R_OK);
    return true;
  } catch (err) {
    return false;
  }
};

http_server.listen(3000, function () {
  console.log("WebSocket: listening on *:3000");
});

/* client connection
*/
io_publisher.on("connection", function (socket) {
  websiteConnected = true;
  if(fps !== undefined) {
    io_publisher.emit("fps", fps);
  }
  if(smallVideo !== undefined && !smallVideoRendering) {
    io_publisher.emit("smallVideo", smallVideo);
  }
  socket.on("signal", function (msg) {
    console.log("signal");
    io_server.emit("signal", msg);
  });
  socket.on('disconnect', function () {
    websiteConnected = false;
  });

  //myb only if openvslam is connected
  if (videoFilePath !== undefined && outputFolder !== undefined && openvslamConnected) {
    io_publisher.emit("outputFolder", outputFolder);
    io_publisher.emit('smallVideo', smallVideo);
  }

  /*socket.on("customImage", function (msg) {
    createCustomImage(msg).catch(e => { console.log(e); io_publisher.emit("customImage", e); });
  });
  socket.on("deleteCustomImage", function(image) {
    if(!exists(image)) {
      socket.emit("deleteCustomImage", "image not found");
    } else {
      fs.unlink(image, function(err) {
        if(err) {
          socket.emit("deleteCustomImage", "an error occured");
          console.log(err);
        } else {
          socket.emit("deleteCustomImage","success");
        }
      });
    }
  });*/
  socket.on("folderAccess", (path) => {
    app.get(path + "/*", function (req, res) {
       res.sendFile(req.originalUrl);
    });
    socket.emit("folderAccess", "routing done");
  });
});

/* used for creating images via the button next to the video,
/  considerable to be removed, as createImageforKeyframe does
/  almost the same.
*/
/*async function createCustomImage(timestamp) {
  let result = await extractFrames({
    input: videoFilePath,
    output: outputFolder + timestamp + '.jpg',
    timestamps: [timestamp]
  });
  io_publisher.emit("customImage", result); //myb log as well
}*/

http_publisher.listen(3002, function () {
  console.log("HTTP server: listening on *:3002")
});
